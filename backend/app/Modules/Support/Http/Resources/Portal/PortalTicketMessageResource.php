<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources\Portal;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PortalTicketMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'body' => $this->body,
            'created_at' => $this->created_at,
            'author' => $this->author_type === 'customer' ? 'Tú' : 'Soporte',
        ];
    }
}
