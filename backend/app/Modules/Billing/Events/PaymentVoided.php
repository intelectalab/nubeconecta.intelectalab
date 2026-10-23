<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Pago validado anulado: sus asignaciones dejan de contar y los comprobantes recuperan saldo. Se emite tras el commit. */
final class PaymentVoided implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $paymentId,
        public readonly string $customerId,
        public readonly string $status,
    ) {}
}
