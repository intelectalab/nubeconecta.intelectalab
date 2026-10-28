<?php

declare(strict_types=1);

namespace App\Modules\Catalog;

use App\Modules\Catalog\Console\DemoCatalogCommand;
use App\Modules\Catalog\Console\LaunchCatalogCommand;
use App\Modules\Catalog\Services\PriceResolver;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Catalog (M-CAT, franja MVP): categorías, productos, planes, precios
 * por moneda y fichas por marca. Interfaz pública para ORD/BIL: PriceResolver.
 * Las tablas son las mismas que lee WebConnector en /public/wp/catalog.
 */
final class CatalogServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(PriceResolver::class);
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([DemoCatalogCommand::class, LaunchCatalogCommand::class]);
        }

        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
