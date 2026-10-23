<?php

declare(strict_types=1);

namespace App\Modules\Billing\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Constancia (voucher) reportada desde el portal: pago reported, en la cola de validación (RN-BIL-050). Se emite tras el commit. */
final class PaymentReported implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $paymentId,
        public readonly string $customerId,
        public readonly string $status,
    ) {}
}
