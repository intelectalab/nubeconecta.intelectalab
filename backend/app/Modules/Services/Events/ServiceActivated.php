<?php

declare(strict_types=1);

namespace App\Modules\Services\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Servicio `pending → active` (aprovisionado) con suscripción creada en la misma transacción. Se emite tras el commit (docs/03 §1). */
final class ServiceActivated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(
        public readonly string $organizationId,
        public readonly string $serviceId,
        public readonly string $customerId,
    ) {}
}
