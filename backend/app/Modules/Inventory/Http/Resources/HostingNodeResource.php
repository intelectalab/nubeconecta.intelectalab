<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class HostingNodeResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['resource', 'server'])->toArray();
        $data['resource'] = $this->whenLoaded('resource', fn () => $this->resource->resource ? ['id' => $this->resource->resource->id, 'name' => $this->resource->resource->name, 'type' => $this->resource->resource->type] : null);
        $data['server'] = $this->whenLoaded('server', fn () => $this->resource->server ? ['id' => $this->resource->server->id, 'hostname' => $this->resource->server->hostname] : null);
        return $data;
    }
}
