<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Listeners;

use App\Modules\Brands\Events\BrandThemeVersionPublished;
use App\Modules\Brands\Events\BrandThemeVersionReverted;
use App\Modules\Brands\Events\BrandUpdated;
use App\Modules\WebConnector\Services\CacheInvalidator;
use Illuminate\Support\Facades\DB;

/**
 * Cambios de marca o de su tema publicado: aviso `all` a los sitios activos de
 * la marca (M-WCN §9). El contrato no tiene un alcance `theme`, por eso `all`.
 * Los de CAT (planes y precios) van en InvalidateCatalogSites; BIL y MON, pendientes.
 */
final class InvalidateBrandSites
{
    public function __construct(private readonly CacheInvalidator $invalidator) {}

    public function handle(BrandUpdated|BrandThemeVersionPublished|BrandThemeVersionReverted $event): void
    {
        if ($event instanceof BrandUpdated) {
            if ($event->action === 'updated') {
                $this->invalidator->forBrand($event->organizationId, $event->brandId, 'all', [], 'BrandUpdated');
            }

            return;
        }

        $brandId = DB::table('brand_theme_versions')->where('id', $event->versionId)->value('brand_id');
        if ($brandId !== null) {
            $this->invalidator->forBrand($event->organizationId, (string) $brandId, 'all', [], class_basename($event));
        }
    }
}
