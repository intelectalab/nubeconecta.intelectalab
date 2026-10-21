<?php

declare(strict_types=1);

namespace App\Modules\Brands\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Serie de comprobantes creada, modificada o borrada. (M-BRD §9) */
final class DocumentSeriesChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $seriesId, public readonly string $action = '') {}
}
