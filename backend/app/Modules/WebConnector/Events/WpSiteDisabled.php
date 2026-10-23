<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Sitio desactivado o dado de baja. (M-WCN §9) */
final class WpSiteDisabled implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
