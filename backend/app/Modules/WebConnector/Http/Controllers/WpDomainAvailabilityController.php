<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\WebConnector\Contracts\DomainAvailabilityChecker;
use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Services\Domains\DomainPriceCatalog;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Disponibilidad de un nombre en varias extensiones (wpDomainAvailability). Solo
 * extensiones del catálogo de precios; estado available|registered|unknown y el
 * precio de registro. Límite por IP del visitante (X-Hub-Visitor-Ip); sin caché
 * de navegador. El verificador es el contrato DomainAvailabilityChecker (D-35).
 */
final class WpDomainAvailabilityController
{
    private const MAX_TLDS = 8;

    public function __construct(private readonly DomainAvailabilityChecker $checker, private readonly DomainPriceCatalog $catalog) {}

    public function show(Request $request): JsonResponse
    {
        /** @var WpSite $site */
        $site = $request->attributes->get('wp_site');
        $data = $request->validate([
            'name' => ['required', 'string', 'max:63'],
            'tlds' => ['sometimes', 'string', 'max:300', 'regex:/^\.?[a-z0-9-]+(\.[a-z0-9-]+)*(,\.?[a-z0-9-]+(\.[a-z0-9-]+)*)*$/'],
            'currency' => ['sometimes', 'in:PEN,USD'],
        ], [], ['name' => 'nombre']);
        $label = strtolower(trim($data['name']));
        if (preg_match('/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/', $label) !== 1) {
            throw ProblemException::validation(['name' => ['Escribe solo letras sin tilde, números y guiones (sin guion al inicio ni al final).']]);
        }
        $requested = isset($data['tlds']) ? array_values(array_unique(array_map(fn ($t) => ltrim(trim($t), '.'), explode(',', $data['tlds'])))) : null;
        if ($requested !== null && count($requested) > self::MAX_TLDS) {
            throw ProblemException::validation(['tlds' => ['Máximo '.self::MAX_TLDS.' extensiones por consulta.']]);
        }

        $ip = trim((string) $request->header('X-Hub-Visitor-Ip', ''));
        $ip = filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : (string) $request->ip();
        $max = max(1, (int) config('hub.domain_availability.requests_per_ip_per_10min', 30));
        $key = 'wcn-domain:'.$site->organization_id.':'.hash_hmac('sha256', $ip, (string) config('app.key'));
        // La IP del visitante la reenvía el plugin (X-Hub-Visitor-Ip) y es falsificable, así
        // que además del límite por IP hay un tope por sitio (10×) que rotar la IP no evade.
        $siteKey = 'wcn-domain-site:'.$site->organization_id;
        if (RateLimiter::tooManyAttempts($key, $max) || RateLimiter::tooManyAttempts($siteKey, $max * 10)) {
            $retry = max(RateLimiter::availableIn($key), RateLimiter::availableIn($siteKey));
            throw new ProblemException(429, 'rate_limited', 'Demasiadas consultas desde esta conexión. Intenta de nuevo en unos minutos.', ['retry_after' => $retry], ['Retry-After' => (string) $retry]);
        }
        RateLimiter::hit($key, 600);
        RateLimiter::hit($siteKey, 600);

        $rows = array_slice($this->catalog->prices($site->organization_id, $data['currency'] ?? 'PEN', $requested), 0, self::MAX_TLDS);
        $out = [];
        foreach ($rows as $row) {
            $out[] = [
                'tld' => $row['tld'],
                'domain' => $label.'.'.$row['tld'],
                'status' => $this->status($label, (string) $row['tld']),
                'currency' => $row['currency'],
                'register_minor' => $row['register_minor'],
                'allows_transfer_in' => $row['allows_transfer_in'],
            ];
        }

        $response = response()->json(['data' => ['name' => $label, 'results' => $out]]);
        $response->headers->set('Cache-Control', 'no-store');

        return $response;
    }

    private function status(string $label, string $tld): string
    {
        $cacheKey = 'domain-availability:'.$label.'.'.$tld;
        $cached = Cache::get($cacheKey);
        if (is_string($cached)) {
            return $cached;
        }
        $status = $this->checker->check($label, $tld);
        if (! in_array($status, [DomainAvailabilityChecker::AVAILABLE, DomainAvailabilityChecker::REGISTERED], true)) {
            $status = DomainAvailabilityChecker::UNKNOWN;
        }
        $ttl = (int) config('hub.domain_availability.cache_seconds.'.$status, 0);
        if ($ttl > 0) {
            Cache::put($cacheKey, $status, $ttl);
        }

        return $status;
    }
}
