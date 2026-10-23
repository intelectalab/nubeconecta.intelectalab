<?php

declare(strict_types=1);

namespace App\Modules\Services\Support;

use Carbon\CarbonImmutable;

/** Ciclos de `plans.cycle`/`subscriptions.cycle` en meses; `one_time` no renueva. */
final class Cycle
{
    public const MONTHS = ['monthly' => 1, 'quarterly' => 3, 'semiannual' => 6, 'annual' => 12, 'biennial' => 24, 'triennial' => 36];

    public static function isRecurring(?string $cycle): bool
    {
        return $cycle !== null && isset(self::MONTHS[$cycle]);
    }

    /** Fecha + un ciclo, sin desbordar el mes (31-01 + 1 mes = 28/29-02). */
    public static function add(string $date, string $cycle): string
    {
        return CarbonImmutable::parse($date)->addMonthsNoOverflow(self::MONTHS[$cycle])->toDateString();
    }
}
