<?php

namespace App\Providers;

use App\Modules\Identity\Auth\TenantUserProvider;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Multitenancy Fase 1 (Opción A): resuelve al usuario del login/sesión sin
        // el filtro global por organización (el correo y el id son únicos en todo
        // el sistema). Ver App\Modules\Identity\Auth\TenantUserProvider.
        Auth::provider('eloquent-tenant', static fn ($app, array $config) => new TenantUserProvider($app['hash'], $config['model']));
    }
}
