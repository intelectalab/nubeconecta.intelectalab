<?php

declare(strict_types=1);

namespace App\Modules\Billing\Listeners;

use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Orders\Events\OrderApproved;

/**
 * OrderApproved → factura inicial en `draft` (M-BIL §9); con `hub.billing.auto_issue`
 * se emite en el acto (si falta la serie o la tasa, queda el borrador o nada y se reporta).
 */
final class DraftInvoiceFromOrder
{
    public function __construct(private readonly InvoiceService $invoices) {}

    public function handle(OrderApproved $event): void
    {
        try {
            $this->invoices->autoIssue($this->invoices->draftFromOrder($event));
        } catch (\Throwable $e) {
            // El pedido ya está aprobado (oyente tras el commit): se informa sin romper la respuesta; el borrador se puede regenerar.
            report($e);
        }
    }
}
