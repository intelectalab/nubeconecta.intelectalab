<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Listeners;

use App\Modules\Catalog\Events\PlanChanged;
use App\Modules\Catalog\Events\PlanPriceChanged;
use App\Modules\WebConnector\Services\CacheInvalidator;
use Illuminate\Support\Facades\DB;

/**
 * Cambio de plan o de precio en CAT: aviso `plan` (claves = código del plan) a
 * los sitios activos de la marca del producto; un producto sin marca se vende
 * en todas, así que avisa a los sitios activos de cada marca (M-WCN §9).
 */
final class InvalidateCatalogSites
{
    public function __construct(private readonly CacheInvalidator $invalidator) {}

    public function handle(PlanChanged|PlanPriceChanged $event): void
    {
        $plan = DB::table('plans')->join('products', 'products.id', '=', 'plans.product_id')
            ->where('plans.id', $event->planId)->where('plans.organization_id', $event->organizationId)
            ->first(['plans.code', 'products.brand_id']);
        if ($plan === null) {
            return;
        }
        $brands = $plan->brand_id !== null
            ? [(string) $plan->brand_id]
            : DB::table('wp_sites')->where('organization_id', $event->organizationId)->where('status', 'active')->distinct()->pluck('brand_id')->map(fn ($id) => (string) $id)->all();
        foreach ($brands as $brandId) {
            $this->invalidator->forBrand($event->organizationId, $brandId, 'plan', [(string) $plan->code], class_basename($event));
        }
    }
}
