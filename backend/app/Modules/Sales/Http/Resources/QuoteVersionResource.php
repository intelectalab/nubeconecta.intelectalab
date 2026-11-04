<?php

declare(strict_types=1);

namespace App\Modules\Sales\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class QuoteVersionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'version_number' => $this->version_number, 'locale' => $this->locale,
            'currency' => trim((string) $this->currency), 'valid_until' => $this->valid_until?->toDateString(),
            'one_time_total_minor' => $this->one_time_total_minor, 'recurring_total_minor' => $this->recurring_total_minor,
            'tax_minor' => $this->tax_minor, 'terms' => $this->terms, 'change_note' => $this->change_note,
            'pdf_file_id' => $this->pdf_file_id, 'created_at' => $this->created_at,
            'items' => QuoteItemResource::collection($this->whenLoaded('items')),
        ];
    }
}
