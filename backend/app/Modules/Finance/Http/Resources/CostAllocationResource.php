<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class CostAllocationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['service'])->toArray();
        $data['service'] = $this->whenLoaded('service', fn () => $this->resource->service ? ['id' => $this->resource->service->id, 'name' => $this->resource->service->label] : null);
        return $data;
    }
}
