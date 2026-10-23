<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Resources;

/** Pago o voucher en el portal: sin notas internas, usuarios ni datos del archivo. */
final class PortalPaymentResource extends PaymentResource
{
    protected bool $portal = true;
}
