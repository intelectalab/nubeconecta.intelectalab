<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Versión publicada anterior archivada al publicar otra. (M-BRD §9) */
final class BrandThemeVersionArchived implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $versionId, public readonly string $action = '') {}
}
