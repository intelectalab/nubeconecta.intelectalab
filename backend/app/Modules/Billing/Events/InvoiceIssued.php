<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Comprobante `draft → issued` con serie y número; dispara el envío electrónico. Se emite tras el commit (docs/03 §3-4). */
final class InvoiceIssued implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $invoiceId,
        public readonly string $customerId,
    ) {}
}
