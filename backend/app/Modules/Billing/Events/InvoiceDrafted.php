<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Comprobante creado en `draft` (pedido aprobado o renovación). Se emite tras el commit (docs/03 §3-4). */
final class InvoiceDrafted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $invoiceId,
        public readonly string $customerId,
    ) {}
}
