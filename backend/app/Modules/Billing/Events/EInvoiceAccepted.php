<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** El OSE/PSE (o el conector simulado) aceptó el comprobante: `fiscal_status = accepted`. Se emite tras el commit (docs/03 §3-4). */
final class EInvoiceAccepted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $invoiceId,
        public readonly string $customerId,
    ) {}
}
