<?php

declare(strict_types=1);

namespace App\Modules\Sales\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Prospecto ganado y convertido en cliente. (M-SAL §9) */
final class LeadWon implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id) {}
}
