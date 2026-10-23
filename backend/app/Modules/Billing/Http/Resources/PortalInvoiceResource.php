<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Resources;

/** Comprobante en el portal: sin notas internas, origen ni motivo de anulación. */
final class PortalInvoiceResource extends InvoiceResource
{
    protected bool $portal = true;
}
