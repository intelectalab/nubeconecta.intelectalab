<?php

declare(strict_types=1);

namespace App\Modules\Orders\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/**
 * Pedido aprobado (draft → approved, docs/03 §7). Lo consumen SRV (servicios
 * en `pending` por línea) y BIL (factura inicial en `draft`). Se emite tras el
 * commit; los oyentes releen el pedido y sus líneas por id.
 */
final class OrderApproved implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /** @param list<string> $itemIds */
    public function __construct(
        public readonly string $organizationId,
        public readonly string $id,
        public readonly string $customerId,
        public readonly string $brandId,
        public readonly string $currency,
        public readonly int $totalMinor,
        public readonly array $itemIds,
        public readonly bool $requiresContract,
        public readonly ?string $approvedBy,
    ) {}
}
