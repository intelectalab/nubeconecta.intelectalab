<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Services;

use App\Modules\Catalog\Models\PlanPrice;
use Illuminate\Support\Carbon;

/**
 * Interfaz pública de CAT para otros módulos (ORD, BIL): precio de venta
 * vigente de un plan en una moneda a una fecha (RN-CAT-002). El precio siempre
 * sale del catálogo, nunca de la petición.
 */
final class PriceResolver
{
    public function current(string $planId, string $currency, ?Carbon $at = null): ?PlanPrice
    {
        $date = ($at ?? now())->toDateString();

        return PlanPrice::query()
            ->where('plan_id', $planId)->where('currency', $currency)
            ->where('effective_from', '<=', $date)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $date))
            ->orderByDesc('effective_from')
            ->first();
    }
}
