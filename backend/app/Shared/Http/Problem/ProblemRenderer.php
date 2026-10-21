<?php

declare(strict_types=1);

namespace App\Shared\Http\Problem;

use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Database\Eloquent\ModelNotFoundException;
use Illuminate\Database\QueryException;
use Illuminate\Http\Exceptions\ThrottleRequestsException;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Session\TokenMismatchException;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpExceptionInterface;
use Throwable;

/**
 * Convierte cualquier excepción de la API en application/problem+json (docs/06 §5).
 * Se registra en bootstrap/app.php para las rutas api/*.
 */
final class ProblemRenderer
{
    /** Códigos estables por estado HTTP cuando la excepción no trae uno propio. */
    private const DEFAULT_CODES = [
        400 => 'bad_request', 401 => 'unauthenticated', 403 => 'forbidden', 404 => 'not_found',
        405 => 'method_not_allowed', 409 => 'conflict', 410 => 'token_expired', 419 => 'csrf_token_mismatch',
        422 => 'validation_failed', 429 => 'rate_limited', 500 => 'server_error', 503 => 'service_unavailable',
    ];

    public static function shouldRender(Request $request): bool
    {
        return $request->is('api/*') || $request->expectsJson();
    }

    public function render(Throwable $e, Request $request): ?JsonResponse
    {
        if (! self::shouldRender($request)) {
            return null;
        }

        [$status, $code, $detail, $extra, $headers] = $this->classify($e);

        return self::response($request, $status, $code, $detail, $extra, $headers);
    }

    /** @param array<string, mixed> $extra */
    public static function response(Request $request, int $status, string $code, ?string $detail = null, array $extra = [], array $headers = []): JsonResponse
    {
        $title = trans()->has("problems.{$code}.title") ? __("problems.{$code}.title") : (JsonResponse::$statusTexts[$status] ?? 'Error');
        if ($detail === null || $detail === '') {
            $detail = trans()->has("problems.{$code}.detail") ? __("problems.{$code}.detail") : null;
        }

        $body = array_filter([
            'type' => config('hub.problem_base_uri').'/'.str_replace('_', '-', $code),
            'title' => $title,
            'status' => $status,
            'code' => $code,
            'detail' => $detail,
        ], static fn ($v) => $v !== null) + $extra + ['request_id' => self::requestId($request)];

        return new JsonResponse($body, $status, ['Content-Type' => 'application/problem+json'] + $headers);
    }

    /** Rutas sin coincidencia no pasan por AssignRequestId: se asigna aquí. */
    private static function requestId(Request $request): string
    {
        if (! $request->attributes->has('request_id')) {
            $request->attributes->set('request_id', (string) \Illuminate\Support\Str::ulid());
        }

        return (string) $request->attributes->get('request_id');
    }

    /** @return array{int, string, ?string, array<string, mixed>, array<string, string>} */
    private function classify(Throwable $e): array
    {
        return match (true) {
            $e instanceof ProblemException => [$e->status, $e->problemCode, $e->getMessage() ?: null, $e->extra, $e->headers],
            $e instanceof ValidationException => [422, 'validation_failed', null, ['errors' => $e->errors()], []],
            $e instanceof AuthenticationException => [401, 'unauthenticated', null, [], []],
            $e instanceof AuthorizationException => [403, 'forbidden', null, [], []],
            $e instanceof ModelNotFoundException => [404, 'not_found', null, [], []],
            $e instanceof TokenMismatchException => [419, 'csrf_token_mismatch', null, [], []],
            $e instanceof ThrottleRequestsException => [429, 'rate_limited', null, [], $e->getHeaders()],
            $e instanceof QueryException && $e->getCode() === '42501' => [409, 'conflict', null, [], []],
            // Unicidad (23505) o clave foránea en uso (23503): el recurso choca con otro existente.
            $e instanceof QueryException && in_array($e->getCode(), ['23505', '23503'], true) => [409, 'conflict', null, [], []],
            $e instanceof HttpExceptionInterface => [
                $e->getStatusCode(),
                self::DEFAULT_CODES[$e->getStatusCode()] ?? 'http_error',
                $e->getStatusCode() < 500 && $e->getStatusCode() !== 404 ? ($e->getMessage() ?: null) : null,
                [],
                $e->getHeaders(),
            ],
            default => [500, 'server_error', config('app.debug') ? $e->getMessage() : null, [], []],
        };
    }
}
