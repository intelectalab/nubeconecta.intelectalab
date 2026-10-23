<?php

declare(strict_types=1);

namespace App\Modules\Services\Http\Resources;

/** Servicio en el portal: sin notas internas, pedido ni datos del personal. */
final class PortalServiceResource extends ServiceResource
{
    protected bool $portal = true;
}
