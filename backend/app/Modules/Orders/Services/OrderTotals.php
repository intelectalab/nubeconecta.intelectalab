<?php

declare(strict_types=1);

namespace App\Modules\Orders\Services;

/**
 * Cálculo de importes del pedido en unidades menores (céntimos), sin flotantes.
 * Orden de RN-BIL-026 reducido al MVP: importe de línea = cantidad × precio
 * (redondeo half-up al céntimo), subtotal = suma de líneas, IGV sobre la base
 * gravada del total (RN-BIL-004/026) con la tasa de `tax_rates` (RN-BIL-023);
 * las líneas con tratamiento `export` (producto y cliente, RN-BIL-008) no llevan IGV.
 */
final class OrderTotals
{
    /** Cantidad numeric(12,3) → milésimas enteras. */
    public static function quantityMilli(string|int|float $quantity): int
    {
        $text = is_string($quantity) ? trim($quantity) : number_format((float) $quantity, 3, '.', '');
        [$int, $dec] = array_pad(explode('.', $text, 2), 2, '');

        return (int) $int * 1000 + (int) str_pad(substr($dec, 0, 3), 3, '0');
    }

    public static function lineAmount(string|int|float $quantity, int $unitPriceMinor): int
    {
        return intdiv(self::quantityMilli($quantity) * $unitPriceMinor + 500, 1000);
    }

    /** Tasa numeric(7,4) en porcentaje ("18.0000") → diezmilésimas de punto porcentual. */
    public static function rateBasis(string $ratePercent): int
    {
        [$int, $dec] = array_pad(explode('.', trim($ratePercent), 2), 2, '');

        return (int) $int * 10000 + (int) str_pad(substr($dec, 0, 4), 4, '0');
    }

    public static function tax(int $taxableMinor, string $ratePercent): int
    {
        return intdiv($taxableMinor * self::rateBasis($ratePercent) + 500000, 1000000);
    }

    /**
     * @param  list<array{amount_minor: int, taxed: bool}>  $lines
     * @return array{subtotal_minor: int, taxable_minor: int, tax_minor: int, total_minor: int}
     */
    public static function compute(array $lines, string $ratePercent): array
    {
        $subtotal = 0;
        $taxable = 0;
        foreach ($lines as $line) {
            $subtotal += $line['amount_minor'];
            if ($line['taxed']) {
                $taxable += $line['amount_minor'];
            }
        }
        $tax = self::tax($taxable, $ratePercent);

        return ['subtotal_minor' => $subtotal, 'taxable_minor' => $taxable, 'tax_minor' => $tax, 'total_minor' => $subtotal + $tax];
    }
}
