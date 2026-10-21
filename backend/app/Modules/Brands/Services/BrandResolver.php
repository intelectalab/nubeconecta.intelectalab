<?php

declare(strict_types=1);

namespace App\Modules\Brands\Services;

use App\Modules\Brands\Models\Brand;

/**
 * Resuelve la marca de una petición (M-BRD §4.4): por host (dominio del portal
 * o dominio de la marca) o por código (`origin_brand` del sistema central).
 * Solo marcas activas.
 */
final class BrandResolver
{
    public function forHost(string $host): ?Brand
    {
        $host = strtolower(preg_replace('/:\d+$/', '', trim($host)) ?? '');
        if ($host === '') {
            return null;
        }

        return Brand::query()->where('status', 'active')
            ->where(fn ($q) => $q->whereRaw('lower(portal_domain) = ?', [$host])->orWhereRaw('lower(domain) = ?', [$host]))
            ->orderByRaw('lower(portal_domain) = ? desc', [$host])
            ->first();
    }

    public function forCode(string $code): ?Brand
    {
        return Brand::query()->where('status', 'active')->where('code', $code)->first();
    }
}
