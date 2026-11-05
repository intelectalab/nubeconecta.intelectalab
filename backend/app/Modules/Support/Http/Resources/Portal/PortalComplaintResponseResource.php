<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources\Portal;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PortalComplaintResponseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'body' => $this->body,
            'sent_at' => $this->sent_at,
            'is_final' => $this->is_final,
        ];
    }
}
