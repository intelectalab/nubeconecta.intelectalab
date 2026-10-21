<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Versión publicada: el portal, el panel y las plantillas de AUT renuevan su caché. (M-BRD §9) */
final class BrandThemeVersionPublished implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $versionId, public readonly string $action = '') {}
}
