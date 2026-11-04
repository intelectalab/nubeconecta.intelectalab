<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class QuoteItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'product_id' => $this->product_id, 'plan_id' => $this->plan_id,
            'description' => $this->description, 'charge_type' => $this->charge_type, 'cycle' => $this->cycle,
            'quantity' => (string) $this->quantity, 'unit_price_minor' => $this->unit_price_minor,
            'discount_minor' => $this->discount_minor, 'total_minor' => $this->total_minor,
            'currency' => trim((string) $this->currency), 'sort_order' => $this->sort_order,
        ];
    }
}
