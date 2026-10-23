<?php

declare(strict_types=1);

namespace App\Modules\Customers\Support;

use App\Modules\Customers\Contracts\TaxIdLookup;

/** Conector nulo: no consulta servicios externos; el usuario completa los datos a mano. */
final class NullTaxIdLookup implements TaxIdLookup
{
    public function lookup(string $taxIdType, string $taxId): ?array
    {
        return null;
    }
}
