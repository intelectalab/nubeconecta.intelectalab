<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CostResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['allocations', 'resource', 'providerAccount'])->toArray();
        $data['resource'] = $this->whenLoaded('resource', fn () => $this->resource->resource ? ['id' => $this->resource->resource->id, 'name' => $this->resource->resource->name] : null);
        $data['provider_account'] = $this->whenLoaded('providerAccount', fn () => $this->resource->providerAccount ? ['id' => $this->resource->providerAccount->id, 'label' => $this->resource->providerAccount->label] : null);
        $data['allocations'] = $this->whenLoaded('allocations', fn () => CostAllocationResource::collection($this->allocations));
        return $data;
    }
}
