<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class IncidentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['owner'])->toArray();
        $data['owner'] = $this->whenLoaded('owner', fn () => $this->owner ? ['id' => $this->owner->id, 'name' => $this->owner->name] : null);
        return $data;
    }
}
