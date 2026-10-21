<?php

declare(strict_types=1);

namespace App\Shared\Http\Middleware;

use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Closure;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\Response;

/**
 * Cabecera Idempotency-Key (docs/06 §6, tabla idempotency_keys).
 *
 * Uso: ->middleware('idempotency') (cabecera obligatoria) o 'idempotency:optional'.
 * 1. Guarda la clave con el hash de método, ruta, cuerpo y usuario.
 * 2. Repetición con el mismo cuerpo → misma respuesta (cabecera Idempotent-Replayed: true).
 * 3. Misma clave con otro cuerpo → 422 idempotency_key_reused.
 * 4. Con la primera aún en curso → 409 idempotency_in_progress; nunca en paralelo.
 * Se guardan las respuestas 2xx y 4xx definitivas; 5xx, 401, 403, 409, 419 y 429
 * liberan la clave para reintentar.
 */
final class Idempotency
{
    private const RETRYABLE = [401, 403, 409, 419, 429];

    public function __construct(private readonly CurrentOrganization $organization) {}

    public function handle(Request $request, Closure $next, string $mode = 'required'): Response
    {
        $key = $request->headers->get('Idempotency-Key');

        if ($key === null || $key === '') {
            if ($mode === 'optional') {
                return $next($request);
            }
            throw ProblemException::badRequest('Falta la cabecera Idempotency-Key.');
        }
        if (strlen($key) > 255 || preg_match('/^[\x21-\x7E]+$/', $key) !== 1) {
            throw ProblemException::badRequest('Idempotency-Key inválida.');
        }

        $organizationId = $this->organization->id();
        $scope = $request->method().' '.($request->route()?->uri() ?? $request->path());
        $hash = $this->requestHash($request);
        $now = now();
        $lockUntil = $now->copy()->addSeconds(config('hub.idempotency.lock_seconds'));

        $inserted = DB::table('idempotency_keys')->insertOrIgnore([
            'id' => (string) Str::uuid7(),
            'organization_id' => $organizationId,
            'key' => $key,
            'scope' => $scope,
            'user_id' => $request->user()?->getAuthIdentifier(),
            'request_hash' => $hash,
            'locked_until' => $lockUntil,
            'expires_at' => $now->copy()->addHours(config('hub.idempotency.ttl_hours')),
            'created_by' => $request->user()?->getAuthIdentifier(),
        ]);

        $row = DB::table('idempotency_keys')
            ->where(['organization_id' => $organizationId, 'scope' => $scope, 'key' => $key])
            ->first();

        if ($inserted === 0) {
            $this->guardExisting($row, $hash, $lockUntil);
            if ($row->completed_at !== null) {
                return $this->replay($row);
            }
        }

        $response = $next($request);
        $status = $response->getStatusCode();

        if ($status >= 500 || in_array($status, self::RETRYABLE, true)) {
            DB::table('idempotency_keys')->where('id', $row->id)->update(['locked_until' => null, 'updated_at' => now()]);

            return $response;
        }

        $content = (string) $response->getContent();
        $body = json_decode($content, true);
        DB::table('idempotency_keys')->where('id', $row->id)->update([
            'response_status' => $status,
            'response_body' => json_encode(json_last_error() === JSON_ERROR_NONE ? $body : ['_raw' => $content], JSON_THROW_ON_ERROR),
            'completed_at' => now(),
            'locked_until' => null,
            'updated_at' => now(),
        ]);

        return $response;
    }

    private function guardExisting(object $row, string $hash, \DateTimeInterface $lockUntil): void
    {
        $expired = now()->greaterThan($row->expires_at);

        if ($expired) {
            // Clave vencida: se reutiliza como nueva.
            DB::table('idempotency_keys')->where('id', $row->id)->update([
                'request_hash' => $hash, 'response_status' => null, 'response_body' => null,
                'completed_at' => null, 'locked_until' => $lockUntil, 'updated_at' => now(),
                'expires_at' => now()->addHours(config('hub.idempotency.ttl_hours')),
            ]);
            $row->completed_at = null;

            return;
        }

        if (! hash_equals(trim((string) $row->request_hash), $hash)) {
            throw new ProblemException(422, 'idempotency_key_reused');
        }

        if ($row->completed_at !== null) {
            return;
        }

        // Sin respuesta guardada: se toma la clave solo si nadie la tiene bloqueada.
        $taken = DB::table('idempotency_keys')
            ->where('id', $row->id)
            ->whereNull('completed_at')
            ->where(fn ($q) => $q->whereNull('locked_until')->orWhere('locked_until', '<=', now()))
            ->update(['locked_until' => $lockUntil, 'updated_at' => now()]);

        if ($taken === 0) {
            throw new ProblemException(409, 'idempotency_in_progress', null, [], ['Retry-After' => '1']);
        }
    }

    private function replay(object $row): JsonResponse
    {
        $body = json_decode((string) $row->response_body, true);
        $status = (int) $row->response_status;
        $headers = ['Idempotent-Replayed' => 'true'];
        if ($status >= 400) {
            $headers['Content-Type'] = 'application/problem+json';
        }

        return new JsonResponse($body, $status, $headers);
    }

    private function requestHash(Request $request): string
    {
        $body = $request->json()->all() ?: $request->except(array_keys($request->allFiles()));

        return hash('sha256', json_encode([
            $request->method(),
            '/'.ltrim($request->path(), '/'),
            self::canonical($body),
            $request->user()?->getAuthIdentifier(),
        ], JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE));
    }

    private static function canonical(mixed $value): mixed
    {
        if (! is_array($value)) {
            return $value;
        }
        if (! array_is_list($value)) {
            ksort($value);
        }

        return array_map(self::canonical(...), $value);
    }
}
