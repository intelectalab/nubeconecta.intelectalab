<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class TicketMessageResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'ticket_id' => $this->ticket_id, 'author_type' => $this->author_type, 'author_user_id' => $this->author_user_id, 'author_contact_id' => $this->author_contact_id, 'author_name' => $this->authorUser?->name ?? $this->authorContact?->name ?? null, 'channel' => $this->channel, 'body' => $this->body, 'is_internal' => $this->is_internal, 'created_at' => $this->created_at, 'version' => $this->version];
    }
}
