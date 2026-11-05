<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class MonitorResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['service', 'resource', 'authorizedBy'])->toArray();
        $data['service'] = $this->whenLoaded('service', fn () => $this->service ? ['id' => $this->service->id, 'label' => $this->service->label] : null);
        $data['resource'] = $this->whenLoaded('resource', fn () => $this->resource->resource ? ['id' => $this->resource->resource->id, 'name' => $this->resource->resource->name ?? null] : null);
        $data['authorized_by_user'] = $this->whenLoaded('authorizedBy', fn () => $this->authorizedBy ? ['id' => $this->authorizedBy->id, 'name' => $this->authorizedBy->name] : null);
        return $data;
    }
}
