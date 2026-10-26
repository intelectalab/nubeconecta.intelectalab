<?php

declare(strict_types=1);

namespace App\Modules\Services;

use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Services\Contracts\ServiceProvisioner;
use App\Modules\Billing\Events\InvoicePaid;
use App\Modules\Orders\Events\OrderCancelled;
use App\Modules\Services\Listeners\AdvanceCommercialDueDate;
use App\Modules\Services\Listeners\CancelPendingServicesFromOrder;
use App\Modules\Services\Listeners\CreateServicesFromOrder;
use App\Modules\Services\Services\ServiceLifecycle;
use App\Modules\Services\Support\ManualProvisioner;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Services (M-SRV, franja MVP): servicios creados al aprobar un pedido,
 * activación con aprovisionamiento manual y suscripción, suspensión,
 * reactivación y cancelación; listado/ficha en el panel y en el portal.
 */
final class ServicesServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->bind(ServiceProvisioner::class, ManualProvisioner::class);
        $this->app->scoped(ServiceLifecycle::class);
    }

    public function boot(): void
    {
        // Se registra antes que Billing (bootstrap/providers.php): la factura inicial enlaza los servicios.
        Event::listen(OrderApproved::class, CreateServicesFromOrder::class);
        Event::listen(OrderCancelled::class, CancelPendingServicesFromOrder::class);
        Event::listen(InvoicePaid::class, AdvanceCommercialDueDate::class);

        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
