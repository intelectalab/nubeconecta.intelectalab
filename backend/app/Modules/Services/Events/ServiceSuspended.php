<?php

declare(strict_types=1);

namespace App\Modules\Services\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Servicio `active → suspended` (suspensión manual en la franja MVP). Se emite tras el commit (docs/03 §1). */
final class ServiceSuspended implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $serviceId,
        public readonly string $customerId,
    ) {}
}
