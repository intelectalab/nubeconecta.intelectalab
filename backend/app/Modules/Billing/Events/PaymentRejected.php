<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Pago reported → rejected con motivo; no toca saldos. Se emite tras el commit. */
final class PaymentRejected implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $paymentId,
        public readonly string $customerId,
        public readonly string $status,
    ) {}
}
