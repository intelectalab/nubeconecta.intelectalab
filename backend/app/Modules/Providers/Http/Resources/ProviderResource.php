<?php

declare(strict_types=1);

namespace App\Modules\Providers\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ProviderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $data = $this->resource->makeHidden(['deleted_at'])->toArray();
        $data['customer'] = $this->whenLoaded('customer', fn () => $this->customer === null ? null : [
            'id' => $this->customer->id, 'code' => $this->customer->code,
            'legal_name' => $this->customer->legal_name, 'trade_name' => $this->customer->trade_name,
        ]);
        $data['accounts'] = ProviderAccountResource::collection($this->whenLoaded('accounts'));

        return $data;
    }
}
