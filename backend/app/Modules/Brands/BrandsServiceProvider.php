<?php

declare(strict_types=1);

namespace App\Modules\Brands;

use App\Modules\Brands\Services\BrandResolver;
use App\Modules\Brands\Services\BrandThemeService;
use App\Modules\Brands\Services\DocumentNumberAllocator;
use App\Modules\Brands\Services\ThemeTokens;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/** Módulo Brands (M-BRD): marcas, entidad emisora, cuentas, series y temas. */
final class BrandsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(ThemeTokens::class);
        $this->app->scoped(BrandThemeService::class);
        $this->app->scoped(BrandResolver::class);
        $this->app->scoped(DocumentNumberAllocator::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
