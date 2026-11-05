<?php

declare(strict_types=1);

namespace App\Modules\Providers\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ProviderAccountResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->toArray();
        $data['provider'] = $this->whenLoaded('provider', fn () => $this->provider === null ? null : [
            'id' => $this->provider->id, 'code' => $this->provider->code,
            'name' => $this->provider->name, 'type' => $this->provider->type,
        ]);
        $data['customer'] = $this->whenLoaded('customer', fn () => $this->customer === null ? null : [
            'id' => $this->customer->id, 'code' => $this->customer->code,
            'legal_name' => $this->customer->legal_name, 'trade_name' => $this->customer->trade_name,
        ]);

        return $data;
    }
}
