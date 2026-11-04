<?php

declare(strict_types=1);

namespace App\Modules\Sales;

use App\Modules\Sales\Services\LeadService;
use App\Modules\Sales\Services\QuoteService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/** Módulo Sales (M-SAL), alcance MVP: prospectos, embudo, actividades y conversión a cliente. */
final class SalesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(LeadService::class);
        $this->app->scoped(QuoteService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
