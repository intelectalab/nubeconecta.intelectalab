<?php

declare(strict_types=1);

namespace App\Modules\Orders\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Pedido registrado en borrador (docs/03 §7). */
final class OrderCreated implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    public function __construct(public readonly string $organizationId, public readonly string $id, public readonly string $customerId) {}
}
