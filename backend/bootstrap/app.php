<?php

declare(strict_types=1);

use App\Modules\Identity\Http\Middleware\EnsureActiveSession;
use App\Modules\Identity\Http\Middleware\EnsureUserType;
use App\Shared\Http\Middleware\AssignRequestId;
use App\Shared\Http\Middleware\Idempotency;
use App\Shared\Http\Middleware\RequirePermission;
use App\Shared\Http\Middleware\RequireRecentMfa;
use App\Shared\Http\Middleware\SetLocaleFromHeader;
use App\Shared\Http\Problem\ProblemRenderer;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Sanctum: las SPA (admin y portal) se autentican con cookie de sesión
        // cuando su origen está en SANCTUM_STATEFUL_DOMAINS (docs/00 §2).
        $middleware->statefulApi();

        $middleware->api(prepend: [AssignRequestId::class, SetLocaleFromHeader::class, App\Modules\WebConnector\Http\Middleware\AuthenticateWpSite::class]);

        // Contratos para los módulos (backend/README.md, "Contratos compartidos").
        $middleware->alias([
            'permission' => RequirePermission::class,
            'mfa.recent' => RequireRecentMfa::class,
            'idempotency' => Idempotency::class,
            'session.active' => EnsureActiveSession::class,
            'user.type' => EnsureUserType::class,
        ]);
        $middleware->group('hub.auth', ['auth:sanctum', 'session.active']);

        // La API nunca redirige a una pantalla de login: responde 401 problem+json.
        $middleware->redirectGuestsTo(fn (Request $request) => ProblemRenderer::shouldRender($request) ? null : '/');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Errores RFC 9457 (application/problem+json) en toda la API (docs/06 §5).
        $exceptions->render(fn (Throwable $e, Request $request) => app(ProblemRenderer::class)->render($e, $request));
        $exceptions->shouldRenderJsonWhen(fn (Request $request) => ProblemRenderer::shouldRender($request));
    })->create();
