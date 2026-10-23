<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Aviso de invalidación entregado al plugin. (M-WCN §9) */
final class WpCacheInvalidationDelivered implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
