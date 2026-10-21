<?php

declare(strict_types=1);

namespace App\Modules\Identity;

use App\Modules\Identity\Console\CreateAdminCommand;
use App\Modules\Identity\Services\AccessControlService;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Shared\Contracts\AccessControl;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
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
        RateLimiter::for('identity-login', fn (Request $request) => Limit::perMinute((int) config('hub.auth.ip_attempts_per_minute'))->by($request->ip()));
        // Códigos TOTP de un usuario ya autenticado (confirmar enrolamiento, step-up): por cuenta, no solo por IP.
        RateLimiter::for('identity-mfa', fn (Request $request) => Limit::perMinutes(
            max(1, (int) config('hub.auth.mfa_pending_minutes')),
            (int) config('hub.auth.mfa_max_attempts'),
        )->by('identity-mfa:'.($request->user()?->getAuthIdentifier() ?? $request->ip())));

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
