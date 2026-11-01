<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use App\Modules\Catalog\Models\BundleItem;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Representación administrativa de un componente de plan paquete. */
final class BundleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var BundleItem $item */
        $item = $this->resource;

        return [
            'id' => $item->id,
            'item_plan_id' => $item->item_plan_id,
            'item_plan_name' => $item->itemPlan?->name,
            'quantity' => $item->quantity,
            'version' => $item->version,
        ];
    }
}
