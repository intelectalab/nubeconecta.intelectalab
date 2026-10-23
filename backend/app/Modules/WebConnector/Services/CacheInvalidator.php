<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services;

use App\Modules\WebConnector\Events\WpCacheInvalidationDelivered;
use App\Modules\WebConnector\Events\WpCacheInvalidationFailed;
use App\Modules\WebConnector\Jobs\SendWpCacheInvalidations;
use App\Modules\WebConnector\Models\WpCacheInvalidation;
use App\Modules\WebConnector\Models\WpSite;
use App\Shared\Http\OutboundUrlGuard;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;
use Throwable;

/**
 * Avisos de invalidación de caché al plugin (M-WCN §4.4, docs/06): encola un
 * `wp_cache_invalidations` por sitio activo de la marca y lo entrega firmado.
 */
final class CacheInvalidator
{
    public function __construct(
        private readonly SecretStore $secrets,
        private readonly WebhookSigner $signer,
        private readonly CurrentOrganization $organization,
    ) {}

    /**
     * @param  list<string>  $keys
     * @return Collection<int, WpCacheInvalidation>
     */
    public function forBrand(string $organizationId, string $brandId, string $scope, array $keys = [], ?string $trigger = null, ?string $requestedBy = null): Collection
    {
        $eventId = (string) Str::uuid();

        return WpSite::withoutGlobalScope('organization')
            ->where('organization_id', $organizationId)->where('brand_id', $brandId)->where('status', 'active')
            ->get()
            ->map(fn (WpSite $site) => $this->forSite($site, $scope, $keys, $trigger, $requestedBy, $eventId));
    }

    /** @param list<string> $keys */
    public function forSite(WpSite $site, string $scope, array $keys = [], ?string $trigger = null, ?string $requestedBy = null, ?string $eventId = null, bool $queue = true): WpCacheInvalidation
    {
        $invalidation = new WpCacheInvalidation;
        $invalidation->forceFill([
            'organization_id' => $site->organization_id,
            'wp_site_id' => $site->id,
            'event_id' => $eventId ?? (string) Str::uuid(),
            'scope' => $scope,
            'keys' => array_values(array_map('strval', $keys)),
            'trigger_event' => $trigger,
            'requested_by' => $requestedBy,
        ])->save();

        if ($queue) {
            SendWpCacheInvalidations::dispatch($invalidation->id)->afterCommit();
        }

        return $invalidation->refresh();
    }

    /** Un intento de entrega. true si el plugin respondió 2xx. */
    public function deliver(WpCacheInvalidation $invalidation, bool $finalOnFailure = false): bool
    {
        $this->organization->set($invalidation->organization_id);
        $settings = app(SettingsReader::class);
        $site = WpSite::withTrashed()->with('brand')->find($invalidation->wp_site_id);
        $attempts = $invalidation->attempts + 1;
        $maxAttempts = max(1, $settings->int('web_connector.webhook.max_attempts', 6));

        $status = null;
        $error = null;
        try {
            if ($site === null || $site->trashed() || $site->webhook_url === null || $site->webhook_secret_id === null) {
                throw new \RuntimeException('El sitio no tiene ruta del plugin o secreto de firma.');
            }
            $body = json_encode([
                'event_id' => $invalidation->event_id,
                'scope' => $invalidation->scope,
                'keys' => $invalidation->keys,
                'brand' => $site->brand?->code,
                'sent_at' => now()->toIso8601ZuluString(),
            ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES);

            // SSRF: se verifica al enviar (no solo al guardar) y la conexión se fija a las IP verificadas.
            $guard = app(OutboundUrlGuard::class);
            $pins = $guard->pins($site->webhook_url, $guard->check($site->webhook_url));
            $response = Http::timeout(max(1, $settings->int('web_connector.webhook.timeout_seconds', 5)))
                ->withOptions(['allow_redirects' => false] + ($pins !== [] ? ['curl' => [CURLOPT_RESOLVE => $pins]] : []))
                ->withHeaders([
                    'X-Hub-Signature' => $this->signer->sign($body, $this->secrets->reveal($site->webhook_secret_id)),
                    'X-Hub-Event-Id' => $invalidation->event_id,
                    'User-Agent' => 'Hub-Webhooks/1',
                ])
                ->withBody($body, 'application/json')
                ->post($site->webhook_url);
            $status = $response->status();
            if (! $response->successful()) {
                $error = 'HTTP '.$status.': '.Str::limit(trim($response->body()), 300, '');
            }
        } catch (Throwable $e) {
            $error = Str::limit($e->getMessage(), 500, '');
        }

        $delivered = $error === null;
        $failed = ! $delivered && ($finalOnFailure || $attempts >= $maxAttempts);
        DB::transaction(function () use ($invalidation, $site, $attempts, $status, $error, $delivered, $failed): void {
            $invalidation->forceFill([
                'attempts' => $attempts,
                'response_status' => $status,
                'last_error' => $error,
                'status' => $delivered ? 'delivered' : ($failed ? 'failed' : 'pending'),
                'delivered_at' => $delivered ? now() : null,
                'next_retry_at' => $delivered || $failed ? null : now()->addSeconds(self::backoff($attempts)),
            ])->save();
            if ($delivered && $site !== null) {
                WpSite::withTrashed()->whereKey($site->id)->update(['last_invalidation_at' => now()]);
            }
        });

        if ($delivered) {
            WpCacheInvalidationDelivered::dispatch($invalidation->organization_id, $invalidation->id);
        } elseif ($failed) {
            WpCacheInvalidationFailed::dispatch($invalidation->organization_id, $invalidation->id);
        }

        return $delivered;
    }

    /** Espera creciente entre intentos (30 s, 60 s, 120 s… hasta 1 h). La doc no fija valores. */
    public static function backoff(int $attempt): int
    {
        return (int) min(3600, 30 * (2 ** max(0, $attempt - 1)));
    }
}
