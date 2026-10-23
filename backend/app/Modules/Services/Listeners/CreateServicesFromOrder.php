<?php

declare(strict_types=1);

namespace App\Modules\Services\Listeners;

use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Services\Services\ServiceLifecycle;
use App\Shared\Http\Problem\ProblemException;

/**
 * OrderApproved → un servicio `pending` por línea (docs/03 §1). Síncrono tras
 * el commit del pedido: así Billing, que escucha después, enlaza cada línea de
 * la factura inicial con su servicio. Con `hub.services.auto_activate` el
 * aprovisionamiento manual los activa en el acto (modo demostración).
 */
final class CreateServicesFromOrder
{
    public function __construct(private readonly ServiceLifecycle $lifecycle) {}

    public function handle(OrderApproved $event): void
    {
        $services = $this->lifecycle->createFromOrder($event);
        if (! config('hub.services.auto_activate', false)) {
            return;
        }
        foreach ($services as $service) {
            try {
                $this->lifecycle->transition($service, 'activate', 'Activación automática al aprobar el pedido', null, 'order');
            } catch (ProblemException) {
                // Requiere contrato o el aprovisionamiento falló: queda `pending` para activación manual.
            }
        }
    }
}
