<?php

declare(strict_types=1);

namespace App\Modules\Orders;

use App\Modules\Orders\Services\OrderService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Orders (M-ORD, franja MVP): pedidos de venta con líneas de planes del
 * catálogo, totales con IGV, aprobar y anular. Evento público: OrderApproved.
 */
final class OrdersServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(OrderService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
