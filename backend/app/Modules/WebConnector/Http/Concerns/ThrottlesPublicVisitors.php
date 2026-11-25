<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Concerns;

use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;

/**
 * Control de abuso de los endpoints públicos del conector (formularios, Libro de
 * Reclamaciones, disponibilidad de dominios). Resuelve la IP del visitante que
 * reenvía el plugin, la hashea, y aplica un límite por IP + un tope por sitio
 * (10×) que no se evade rotando la IP del visitante.
 */
trait ThrottlesPublicVisitors
{
    /** IP del visitante que reenvía el plugin (X-Hub-Visitor-Ip); si no viene o no es válida, la del servidor. */
    protected function visitorIp(Request $request): string
    {
        $header = trim((string) $request->header('X-Hub-Visitor-Ip', ''));

        return filter_var($header, FILTER_VALIDATE_IP) !== false ? $header : (string) $request->ip();
    }

    protected function visitorIpHash(string $ip): string
    {
        return hash_hmac('sha256', $ip, (string) config('app.key'));
    }

    /**
     * Lanza 429 si se supera el límite por IP del visitante o el tope por sitio.
     * `$bucket` es el prefijo base (p. ej. `wcn-form`): la clave por IP es
     * `{bucket}:{org}:{ipHash}` y la de sitio `{bucket}-site:{org}`.
     */
    protected function assertVisitorWithinLimit(string $bucket, string $org, string $ipHash, int $max, string $message): void
    {
        $key = $bucket.':'.$org.':'.$ipHash;
        $siteKey = $bucket.'-site:'.$org;
        if (RateLimiter::tooManyAttempts($key, $max) || RateLimiter::tooManyAttempts($siteKey, $max * 10)) {
            $retry = max(RateLimiter::availableIn($key), RateLimiter::availableIn($siteKey));
            throw new ProblemException(429, 'rate_limited', $message, ['retry_after' => $retry], ['Retry-After' => (string) $retry]);
        }
    }

    /** Registra un intento en el límite por IP y en el de sitio (ventana `$ttl` segundos). */
    protected function recordVisitorHit(string $bucket, string $org, string $ipHash, int $ttl): void
    {
        RateLimiter::hit($bucket.':'.$org.':'.$ipHash, $ttl);
        RateLimiter::hit($bucket.'-site:'.$org, $ttl);
    }
}
