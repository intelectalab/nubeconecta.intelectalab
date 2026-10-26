<?php

declare(strict_types=1);

namespace App\Modules\Billing\Listeners;

use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Services\Events\ServiceCancelled;

/**
 * ServiceCancelled → las renovaciones abiertas sin pagos de sus suscripciones
 * se anulan (o se descartan si aún son borrador): no se cobra un servicio cancelado.
 */
final class CancelRenewalsFromService
{
    public function __construct(private readonly InvoiceService $invoices, private readonly EInvoiceConnector $connector) {}

    public function handle(ServiceCancelled $event): void
    {
        try {
            $this->invoices->cancelForService($event->serviceId, 'Servicio cancelado', $this->connector);
        } catch (\Throwable $e) {
            report($e);
        }
    }
}
