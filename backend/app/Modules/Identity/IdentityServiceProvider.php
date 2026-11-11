<?php

declare(strict_types=1);

namespace App\Modules\Identity;

use App\Modules\Customers\Events\ContactPortalAccessGranted;
use App\Modules\Identity\Console\CreateAdminCommand;
use App\Modules\Identity\Listeners\SendPortalInvitation;
use App\Modules\Identity\Services\AccessControlService;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Shared\Contracts\AccessControl;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Identity (M-IDN). Patrón que siguen todos los módulos:
 * registra sus servicios en register() y en boot() carga sus rutas
 * (routes/api.php del módulo bajo /api/v1 con el grupo `api`) y sus comandos.
 */
final class IdentityServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(SecurityPolicy::class);
        $this->app->scoped(AuthSessionManager::class);
        $this->app->scoped(AccessControl::class, AccessControlService::class);
    }

    public function boot(): void
    {
        // Tabla canónica personal_access_tokens: organization_id obligatorio (lo fija el modelo).
        \Laravel\Sanctum\Sanctum::usePersonalAccessTokenModel(\App\Modules\Identity\Models\PersonalAccessToken::class);

        RateLimiter::for('identity-login', fn (Request $request) => Limit::perMinute((int) config('hub.auth.ip_attempts_per_minute'))->by($request->ip()));
        // Códigos TOTP de un usuario ya autenticado (confirmar enrolamiento, step-up): por cuenta, no solo por IP.
        RateLimiter::for('identity-mfa', fn (Request $request) => Limit::perMinutes(
            max(1, (int) config('hub.auth.mfa_pending_minutes')),
            (int) config('hub.auth.mfa_max_attempts'),
        )->by('identity-mfa:'.($request->user()?->getAuthIdentifier() ?? $request->ip())));

        // Enlaces del portal: comprobar/usar un token por IP; "olvidé mi contraseña" por IP y por correo (el 429 es igual exista o no la cuenta).
        RateLimiter::for('identity-token-check', fn (Request $request) => Limit::perMinute(30)->by('identity-token-check:'.$request->ip()));
        // Branding del login: lectura pública anónima, cacheable; límite holgado por IP.
        RateLimiter::for('public-branding', fn (Request $request) => Limit::perMinute(60)->by('public-branding:'.$request->ip()));
        RateLimiter::for('identity-token-use', fn (Request $request) => Limit::perMinute(10)->by('identity-token-use:'.$request->ip()));
        RateLimiter::for('identity-forgot', fn (Request $request) => [
            Limit::perMinute((int) config('hub.auth.forgot_per_minute_ip'))->by('identity-forgot-ip:'.$request->ip()),
            Limit::perHour((int) config('hub.auth.forgot_per_hour_email'))->by('identity-forgot-email:'.sha1(mb_strtolower(trim((string) $request->input('email'))))),
        ]);

        Event::listen(ContactPortalAccessGranted::class, SendPortalInvitation::class);

        // {user} y {role} solo aceptan UUID: otro valor responde 404 sin llegar a la base.
        Route::pattern('user', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');
        Route::pattern('role', '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}');

        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }

        if ($this->app->runningInConsole()) {
            $this->commands([CreateAdminCommand::class]);
        }
    }
}
