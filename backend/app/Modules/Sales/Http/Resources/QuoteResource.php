<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class QuoteResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['customer', 'lead', 'brand', 'owner'])->toArray();
        // La relación currentVersion serializa bajo la clave 'current_version' y choca
        // con la columna entera del mismo nombre; se restaura el entero y el objeto va aparte.
        $data['current_version'] = (int) $this->current_version;
        $data['currency'] = trim((string) $this->currency);
        $data['customer'] = $this->whenLoaded('customer', fn () => $this->customer === null ? null : ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->trade_name ?: $this->customer->legal_name]);
        $data['lead'] = $this->whenLoaded('lead', fn () => $this->lead === null ? null : ['id' => $this->lead->id, 'name' => $this->lead->company_name ?: $this->lead->name]);
        $data['brand'] = $this->whenLoaded('brand', fn () => $this->brand === null ? null : ['id' => $this->brand->id, 'name' => $this->brand->name]);
        $data['owner'] = $this->whenLoaded('owner', fn () => $this->owner === null ? null : ['id' => $this->owner->id, 'name' => $this->owner->name]);
        $data['current_version_data'] = new QuoteVersionResource($this->whenLoaded('currentVersion'));
        return $data;
    }
}
