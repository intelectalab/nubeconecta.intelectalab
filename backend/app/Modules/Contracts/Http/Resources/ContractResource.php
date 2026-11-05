<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ContractResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['customer', 'brand', 'approver', 'quote'])->toArray();
        // Evita que la relación currentVersion reemplace la columna entera current_version.
        $data['current_version'] = (int) $this->current_version;
        $data['currency'] = trim((string) $this->currency);
        $data['customer'] = $this->whenLoaded('customer', fn () => $this->customer === null ? null : ['id' => $this->customer->id, 'code' => $this->customer->code, 'name' => $this->customer->trade_name ?: $this->customer->legal_name]);
        $data['brand'] = $this->whenLoaded('brand', fn () => $this->brand === null ? null : ['id' => $this->brand->id, 'name' => $this->brand->name]);
        $data['approver'] = $this->whenLoaded('approver', fn () => $this->approver === null ? null : ['id' => $this->approver->id, 'name' => $this->approver->name]);
        $data['quote'] = $this->whenLoaded('quote', fn () => $this->quote === null ? null : ['id' => $this->quote->id, 'number' => $this->quote->number]);
        $data['current_version_data'] = new ContractVersionResource($this->whenLoaded('currentVersion'));
        return $data;
    }
}
