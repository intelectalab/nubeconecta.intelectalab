<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ServiceTypeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'code' => $this->code, 'name' => $this->name, 'description' => $this->description,
            'icon' => $this->icon, 'category_id' => $this->category_id, 'brand_ids' => $this->brand_ids,
            'status' => $this->status, 'sale_mode' => $this->sale_mode, 'requires_contract' => $this->requires_contract,
            'default_provider_id' => $this->default_provider_id, 'component_kind' => $this->component_kind,
            'delivery_tasks' => $this->delivery_tasks, 'portal_fields' => $this->portal_fields,
            'activated_at' => $this->activated_at, 'archived_at' => $this->archived_at, 'version' => $this->version,
            'fields' => ServiceTypeFieldResource::collection($this->whenLoaded('fields')),
        ];
    }
}
