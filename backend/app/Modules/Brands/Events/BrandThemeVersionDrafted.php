<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Borrador de versión de tema creado. (M-BRD §9) */
final class BrandThemeVersionDrafted implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $versionId, public readonly string $action = '') {}
}
