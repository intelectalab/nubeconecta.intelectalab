<?php

declare(strict_types=1);

namespace App\Modules\Files\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class FileResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'original_name' => $this->original_name,
            'mime_type' => $this->mime_type,
            'size_bytes' => $this->size_bytes,
            'scan_status' => $this->scan_status,
            'visibility' => $this->visibility,
            'version' => $this->version,
            'attachable_type' => $this->attachable_type,
            'attachable_id' => $this->attachable_id,
            'created_at' => $this->created_at,
            'url' => $this->when($this->resource->getAttribute('temporary_url') !== null, fn () => $this->resource->getAttribute('temporary_url')),
            'attachable' => $this->whenLoaded('attachable', fn () => $this->attachable ? ['id' => $this->attachable->getKey()] : null),
        ];
    }
}
