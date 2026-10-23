<?php

declare(strict_types=1);

namespace App\Modules\Billing\Support;

/** Importe en letras de la representación impresa: "SON: CIENTO VEINTE CON 50/100 SOLES". Solo enteros. */
final class AmountInWords
{
    private const UNITS = ['', 'UNO', 'DOS', 'TRES', 'CUATRO', 'CINCO', 'SEIS', 'SIETE', 'OCHO', 'NUEVE', 'DIEZ', 'ONCE', 'DOCE', 'TRECE', 'CATORCE', 'QUINCE',
        'DIECISÉIS', 'DIECISIETE', 'DIECIOCHO', 'DIECINUEVE', 'VEINTE', 'VEINTIUNO', 'VEINTIDÓS', 'VEINTITRÉS', 'VEINTICUATRO', 'VEINTICINCO', 'VEINTISÉIS',
        'VEINTISIETE', 'VEINTIOCHO', 'VEINTINUEVE'];

    private const TENS = ['', '', '', 'TREINTA', 'CUARENTA', 'CINCUENTA', 'SESENTA', 'SETENTA', 'OCHENTA', 'NOVENTA'];

    private const HUNDREDS = ['', 'CIENTO', 'DOSCIENTOS', 'TRESCIENTOS', 'CUATROCIENTOS', 'QUINIENTOS', 'SEISCIENTOS', 'SETECIENTOS', 'OCHOCIENTOS', 'NOVECIENTOS'];

    public static function format(int $minor, string $currency): string
    {
        $name = $currency === 'USD' ? 'DÓLARES AMERICANOS' : 'SOLES';
        $int = intdiv($minor, 100);
        $cents = str_pad((string) ($minor % 100), 2, '0', STR_PAD_LEFT);

        return 'SON: '.self::words($int)." CON {$cents}/100 {$name}";
    }

    public static function words(int $n): string
    {
        if ($n === 0) {
            return 'CERO';
        }
        $parts = [];
        $millions = intdiv($n, 1_000_000);
        $thousands = intdiv($n % 1_000_000, 1000);
        $rest = $n % 1000;
        if ($millions > 0) {
            $parts[] = $millions === 1 ? 'UN MILLÓN' : self::apocope(self::below1000($millions)).' MILLONES';
        }
        if ($thousands > 0) {
            $parts[] = $thousands === 1 ? 'MIL' : self::apocope(self::below1000($thousands)).' MIL';
        }
        if ($rest > 0) {
            $parts[] = self::below1000($rest);
        }

        return implode(' ', $parts);
    }

    private static function below1000(int $n): string
    {
        if ($n === 100) {
            return 'CIEN';
        }
        $h = intdiv($n, 100);
        $r = $n % 100;
        $text = self::HUNDREDS[$h];
        if ($r > 0) {
            $tail = $r < 30 ? self::UNITS[$r] : self::TENS[intdiv($r, 10)].($r % 10 > 0 ? ' Y '.self::UNITS[$r % 10] : '');
            $text = trim($text.' '.$tail);
        }

        return $text;
    }

    /** "VEINTIUNO MIL" → "VEINTIÚN MIL", "UNO" → "UN". */
    private static function apocope(string $words): string
    {
        return (string) preg_replace(['/VEINTIUNO$/u', '/UNO$/u'], ['VEINTIÚN', 'UN'], $words);
    }
}
