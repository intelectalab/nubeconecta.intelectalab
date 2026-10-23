<?php

declare(strict_types=1);

namespace App\Modules\Customers\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Cliente creado (alta, conversión de prospecto o importación). (M-CUS §9) */
final class CustomerCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
