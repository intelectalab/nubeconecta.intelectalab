<?php

declare(strict_types=1);

namespace App\Modules\Customers\Contracts;

/**
 * Consulta externa de un documento (p. ej. RUC en SUNAT) para autocompletar la
 * razón social. M-CUS §10 no define conector directo: la implementación por
 * defecto es nula (NullTaxIdLookup) y el alta se completa a mano.
 */
interface TaxIdLookup
{
    /** @return array{legal_name?: string, address?: string, status?: string}|null null si no hay datos */
    public function lookup(string $taxIdType, string $taxId): ?array;
}
