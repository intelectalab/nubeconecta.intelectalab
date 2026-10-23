<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Comprobante con saldo cero por pagos validados (docs/03 §3); renueva o reactiva servicios en franjas siguientes. Se emite tras el commit. */
final class InvoicePaid implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $invoiceId,
        public readonly string $customerId,
    ) {}
}
