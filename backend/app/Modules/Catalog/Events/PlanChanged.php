<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Plan del catálogo creado, editado o borrado. Nombre fuera del contrato de
 * M-CAT §9 (anotado en el README); lo escucha WebConnector para invalidar la
 * caché de las webs de la marca del producto.
 */
final class PlanChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $planId,
        public readonly string $action,
    ) {}
}
