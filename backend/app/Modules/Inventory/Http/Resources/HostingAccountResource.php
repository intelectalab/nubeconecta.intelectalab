<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class HostingAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['hostingNode', 'service', 'customer'])->toArray();
        $data['hosting_node'] = $this->whenLoaded('hostingNode', fn () => $this->hostingNode ? ['id' => $this->hostingNode->id, 'hostname' => $this->hostingNode->hostname] : null);
        $data['service'] = $this->whenLoaded('service', fn () => $this->service ? ['id' => $this->service->id, 'status' => $this->service->status] : null);
        $data['customer'] = $this->whenLoaded('customer', fn () => $this->customer ? ['id' => $this->customer->id, 'name' => $this->customer->trade_name ?: $this->customer->legal_name] : null);
        return $data;
    }
}
