<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Aviso de invalidación agotó sus intentos (alerta al administrador). (M-WCN §9) */
final class WpCacheInvalidationFailed implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
