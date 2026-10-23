<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Precio de un plan registrado, editado (solo programados) o borrado. Cubre el
 * `PlanPriceScheduled` de M-CAT §9 en la franja MVP; lo escucha WebConnector.
 */
final class PlanPriceChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $planId,
        public readonly string $priceId,
        public readonly string $action,
    ) {}
}
