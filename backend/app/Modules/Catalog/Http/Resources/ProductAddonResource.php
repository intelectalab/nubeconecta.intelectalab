<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use App\Modules\Catalog\Models\ProductAddon;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Representación administrativa de un complemento y el nombre de su producto.
 *
 * @property ProductAddon $resource
 */
final class ProductAddonResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $addon = $this->resource;

        return [
            'id' => $addon->id,
            'addon_product_id' => $addon->addon_product_id,
            'addon_product_name' => $addon->addonProduct?->name,
            'is_required' => $addon->is_required,
            'version' => $addon->version,
        ];
    }
}
