<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources\Portal;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PortalTicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'number' => $this->number,
            'type' => $this->type,
            'status' => $this->status,
            'priority' => $this->priority,
            'subject' => $this->subject,
            'created_at' => $this->created_at,
            'updated_at' => $this->updated_at,
            'resolved_at' => $this->resolved_at,
            'closed_at' => $this->closed_at,
            'messages' => $this->whenLoaded('messages', fn ($messages) => PortalTicketMessageResource::collection($messages->where('is_internal', false))),
            // Solo adjuntos visibles para el cliente; nunca los internos del staff.
            'attachments' => $this->whenLoaded('attachments', fn ($files) => $files
                ->where('visibility', 'customer')
                ->values()
                ->map(fn ($file) => [
                    'id' => $file->id,
                    'original_name' => $file->original_name,
                    'mime_type' => $file->mime_type,
                    'size_bytes' => $file->size_bytes,
                    'created_at' => $file->created_at,
                ])),
        ];
    }
}
