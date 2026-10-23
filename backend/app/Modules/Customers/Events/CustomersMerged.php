<?php

declare(strict_types=1);

namespace App\Modules\Customers\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Dos clientes fusionados: $id es el sobreviviente, $absorbedId el absorbido. (M-CUS §9) */
final class CustomersMerged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id, public readonly string $absorbedId) {}
}
