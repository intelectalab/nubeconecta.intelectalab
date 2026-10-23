<?php

namespace HubConnector\Cache;

use HubConnector\Api\Endpoints;
use HubConnector\Api\HubClient;
use HubConnector\Settings;

/**
 * Caché de lecturas del sistema (docs/13 §6 y §7).
 *
 * - Transient fresco hubc_<hash> con cache_ttl_seconds de GET /public/wp/site
 *   (filtrable con hub_connector_cache_ttl) y última copia <clave>_s con
 *   stale_max_hours, que guarda también el ETag para pedir con If-None-Match.
 * - Índice (opción hubc_index) clave → alcance y etiquetas, para que el webhook
 *   borre solo lo afectado.
 * - Renovación perezosa con bloqueo breve (add_option) contra estampidas.
 * - Si el sistema falla (sin respuesta, 5xx, 401, 426, 429) se sirve la última copia.
 */
class CacheStore
{
    public const INDEX = 'hubc_index';
    public const STATUS = 'hubc_status';
    private const LOCK_SECONDS = 30;
    private const DOWN_BACKOFF_SECONDS = 60;
    private const DEFAULT_TTL = 600;
    private const DEFAULT_STALE_HOURS = 72;

    /** @var array<string, mixed>|null */
    private ?array $siteMemo = null;

    public function __construct(private HubClient $client, private Settings $settings)
    {
    }

    public function key(string $path, array $query, string $lang): string
    {
        ksort($query);

        return 'hubc_' . substr(hash('sha256', $path . '?' . http_build_query($query) . '#' . $lang . '#' . $this->settings->fingerprint()), 0, 24);
    }

    /**
     * @param array<string, scalar|null> $query
     * @param list<string>|\Closure(mixed):list<string> $tags ids o códigos para borrar por
     *        alcance (o una función que los saca de la respuesta)
     * @return array{status:string, data:mixed}
     *         status: fresh | refreshed | stale | missing | not_found | invalid
     */
    public function fetch(string $path, array $query, string $scope, array|\Closure $tags = []): array
    {
        $query = array_filter($query, static fn ($v) => $v !== null && $v !== '');
        $key = $this->key($path, $query, $this->settings->lang());

        $fresh = get_transient($key);
        if (is_array($fresh) && array_key_exists('d', $fresh)) {
            return ['status' => 'fresh', 'data' => $fresh['d']];
        }

        $stale = get_transient($key . '_s');
        $stale = is_array($stale) && array_key_exists('d', $stale) ? $stale : null;

        if ($this->blocked() || (!$this->lock($key) && $stale !== null)) {
            return $this->fallback($key, $stale);
        }

        try {
            $response = $this->client->get($path, $query, $stale['e'] ?? null);
        } finally {
            delete_option('hubc_lock_' . $key);
        }

        $status = $response['status'];
        if ($status === 200 || ($status === 304 && $stale !== null)) {
            $data = $status === 200 ? $response['data'] : $stale['d'];
            $this->store($key, $path, $data, $status === 200 ? (string) ($response['etag'] ?? '') : (string) ($stale['e'] ?? ''), $scope, $tags);

            return ['status' => 'refreshed', 'data' => $data];
        }

        $this->recordError($status, (string) ($response['error'] ?? 'error'), $response['retry_after'] ?? null);
        if ($status === 404) {
            return ['status' => 'not_found', 'data' => null];
        }
        if ($status === 400 || $status === 422) {
            return ['status' => 'invalid', 'data' => null];
        }

        return $this->fallback($key, $stale);
    }

    /** Configuración del sitio (GET /public/wp/site), con caché de alcance site. */
    public function site(): ?array
    {
        if ($this->siteMemo !== null) {
            return $this->siteMemo;
        }
        $result = $this->fetch(Endpoints::SITE, [], 'site');
        $this->siteMemo = is_array($result['data']) ? $result['data'] : null;

        return $this->siteMemo;
    }

    /** Última copia de una lectura, sin llamar al sistema. */
    public function peekStale(string $path, array $query = []): mixed
    {
        $stale = get_transient($this->key($path, $query, $this->settings->lang()) . '_s');

        return is_array($stale) ? ($stale['d'] ?? null) : null;
    }

    /**
     * Borra las entradas frescas afectadas por un aviso (docs/13 §6). La última copia
     * se conserva como respaldo; la siguiente visita renueva.
     *
     * @param list<string> $keys
     */
    public function invalidate(string $scope, array $keys = []): int
    {
        $keys = array_map('strval', $keys);
        $index = $this->index();
        $deleted = 0;
        foreach ($index as $key => $entry) {
            if ($this->matches($scope, $keys, (string) ($entry['s'] ?? ''), (array) ($entry['g'] ?? []))) {
                delete_transient($key);
                $deleted++;
            }
        }
        if ($scope === 'all' || $scope === 'site') {
            $this->siteMemo = null;
        }

        return $deleted;
    }

    /** Borra todo (frescos, últimas copias, índice y estado): desinstalación o cambio de conexión. */
    public function purgeAll(): void
    {
        foreach (array_keys($this->index()) as $key) {
            delete_transient($key);
            delete_transient($key . '_s');
        }
        delete_option(self::INDEX);
        delete_option(self::STATUS);
        $this->siteMemo = null;
    }

    /** @return array<string, mixed> */
    public function status(): array
    {
        $status = get_option(self::STATUS, []);

        return is_array($status) ? $status : [];
    }

    /** Quita los bloqueos por token, versión o límite (p. ej., tras guardar un token nuevo). */
    public function clearBlock(): void
    {
        $status = $this->status();
        unset($status['block']);
        update_option(self::STATUS, $status, false);
    }

    private function matches(string $scope, array $keys, string $entryScope, array $tags): bool
    {
        if ($scope === 'all') {
            return true;
        }
        $hit = $keys === [] || $tags === [] || array_intersect($keys, array_map('strval', $tags)) !== [];
        if ($scope === 'catalog') {
            return in_array($entryScope, ['catalog', 'plan'], true) && $hit;
        }
        if ($scope === 'plan') {
            return in_array($entryScope, ['catalog', 'plan'], true)
                && ($keys === [] || array_intersect($keys, array_map('strval', $tags)) !== []);
        }

        return $entryScope === $scope && $hit;
    }

    private function store(string $key, string $path, mixed $data, string $etag, string $scope, array|\Closure $tags): void
    {
        $tags = $tags instanceof \Closure ? (array) $tags($data) : $tags;
        if ($path === Endpoints::SITE && is_array($data)) {
            $this->siteMemo = $data;
        }
        $ttl = (int) apply_filters('hub_connector_cache_ttl', $this->ttl(), $path);
        if ($ttl > 0) {
            set_transient($key, ['d' => $data], $ttl);
        } else {
            delete_transient($key);
        }
        set_transient($key . '_s', ['d' => $data, 'e' => $etag, 't' => time()], max(1, $this->staleHours()) * 3600);

        $index = $this->index();
        $entry = ['s' => $scope, 'g' => array_values(array_unique(array_map('strval', $tags)))];
        if (($index[$key] ?? null) !== $entry) {
            $index[$key] = $entry;
            update_option(self::INDEX, $index, false);
        }

        $status = $this->status();
        $status['last_success'] = time();
        unset($status['stale'][$key]);
        if (in_array($status['block']['reason'] ?? '', ['rate', 'down'], true)) {
            unset($status['block']);
        }
        update_option(self::STATUS, $status, false);
    }

    private function fallback(string $key, ?array $stale): array
    {
        if ($stale === null) {
            return ['status' => 'missing', 'data' => null];
        }
        $status = $this->status();
        if (!isset($status['stale'][$key])) {
            $status['stale'][$key] = time();
            update_option(self::STATUS, $status, false);
        }

        return ['status' => 'stale', 'data' => $stale['d']];
    }

    private function recordError(int $code, string $error, ?int $retryAfter): void
    {
        $status = $this->status();
        $status['last_error'] = ['at' => time(), 'status' => $code, 'code' => $error];
        if ($code === 401) {
            // No reintenta hasta que cambie el token (docs/13 §5).
            $status['block'] = ['reason' => 'token', 'fp' => $this->settings->fingerprint()];
        } elseif ($code === 426) {
            $status['block'] = ['reason' => 'version', 'version' => HUB_CONNECTOR_VERSION];
        } elseif ($code === 429) {
            $status['block'] = ['reason' => 'rate', 'until' => time() + ($retryAfter ?? 60)];
        } elseif ($code === 0 || $code >= 500) {
            // Sistema caído: pausa corta para que cada visita no espere el tiempo de espera de cada lectura.
            $status['block'] = ['reason' => 'down', 'until' => time() + self::DOWN_BACKOFF_SECONDS];
        }
        update_option(self::STATUS, $status, false);
    }

    private function blocked(): bool
    {
        $block = $this->status()['block'] ?? null;
        if (!is_array($block)) {
            return false;
        }

        return match ($block['reason'] ?? '') {
            'token' => ($block['fp'] ?? '') === $this->settings->fingerprint(),
            'version' => ($block['version'] ?? '') === HUB_CONNECTOR_VERSION,
            'rate', 'down' => time() < (int) ($block['until'] ?? 0),
            default => false,
        };
    }

    private function lock(string $key): bool
    {
        $name = 'hubc_lock_' . $key;
        if (add_option($name, time(), '', 'no')) {
            return true;
        }
        if (time() - (int) get_option($name, 0) > self::LOCK_SECONDS) {
            update_option($name, time(), false);

            return true;
        }

        return false;
    }

    private function ttl(): int
    {
        $site = $this->siteMemo ?? $this->peekStale(Endpoints::SITE);

        return is_array($site) && isset($site['cache_ttl_seconds']) ? max(0, (int) $site['cache_ttl_seconds']) : self::DEFAULT_TTL;
    }

    private function staleHours(): int
    {
        $site = $this->siteMemo ?? $this->peekStale(Endpoints::SITE);

        return is_array($site) && isset($site['stale_max_hours']) ? (int) $site['stale_max_hours'] : self::DEFAULT_STALE_HOURS;
    }

    /** @return array<string, array{s:string, g:list<string>}> */
    private function index(): array
    {
        $index = get_option(self::INDEX, []);

        return is_array($index) ? $index : [];
    }
}
