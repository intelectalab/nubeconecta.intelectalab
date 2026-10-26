<?php

declare(strict_types=1);

namespace App\Modules\Billing\Listeners;

use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Orders\Events\OrderCancelled;

/**
 * OrderCancelled → el comprobante del pedido deja de cobrarse (docs/03 §7):
 * borrador descartado; emitido sin pagos anulado; con pagos queda para nota de
 * crédito (auditado `invoice.cancel_skipped`). Tras el commit del pedido.
 */
final class CancelInvoicesFromOrder
{
    public function __construct(private readonly InvoiceService $invoices, private readonly EInvoiceConnector $connector) {}

    public function handle(OrderCancelled $event): void
    {
        try {
            $this->invoices->cancelForOrder($event->id, 'Pedido anulado', $this->connector);
        } catch (\Throwable $e) {
            report($e); // el pedido ya está anulado: no se rompe la respuesta
        }
    }
}
