<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Comprobante issued/partially_paid → overdue: venció con saldo (job diario de cobranza). Se emite tras el commit. */
final class InvoiceOverdue implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $invoiceId,
        public readonly string $customerId,
    ) {}
}
