<?php

declare(strict_types=1);

namespace App\Modules\Customers\Events;

use Illuminate\Contracts\Events\ShouldDispatchAfterCommit;
use Illuminate\Foundation\Events\Dispatchable;

/** Cambio de datos fiscales (razón social, documento, dirección fiscal, tratamiento tributario), desde el panel o el portal. (M-CUS §5, §9) */
final class CustomerFiscalDataChanged implements ShouldDispatchAfterCommit
{
    use Dispatchable;

    /** @param array<string, array{before: mixed, after: mixed}> $changes */
    public function __construct(public readonly string $organizationId, public readonly string $id, public readonly array $changes, public readonly string $origin) {}
}
