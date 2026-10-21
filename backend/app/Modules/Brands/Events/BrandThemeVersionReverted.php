<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Reversión: copia de una versión anterior (la nueva versión). (M-BRD §9) */
final class BrandThemeVersionReverted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $versionId, public readonly string $action = '') {}
}
