<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Marca creada, modificada o dada de baja. (M-BRD §9) */
final class BrandUpdated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $brandId, public readonly string $action = '') {}
}
