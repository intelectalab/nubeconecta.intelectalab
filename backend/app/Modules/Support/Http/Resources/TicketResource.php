<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use App\Modules\Files\Http\Resources\FileResource;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class TicketResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'number' => $this->number, 'customer_id' => $this->customer_id, 'contact_id' => $this->contact_id, 'brand_id' => $this->brand_id, 'type' => $this->type, 'status' => $this->status, 'priority' => $this->priority, 'channel' => $this->channel, 'subject' => $this->subject, 'assignee_id' => $this->assignee_id, 'assignee' => $this->whenLoaded('assignee', fn () => $this->assignee ? ['id' => $this->assignee->id, 'name' => $this->assignee->name] : null), 'customer' => $this->whenLoaded('customer', fn () => $this->customer ? ['id' => $this->customer->id, 'name' => $this->customer->trade_name ?: $this->customer->legal_name] : null), 'first_response_due_at' => $this->first_response_due_at, 'first_responded_at' => $this->first_responded_at, 'resolution_due_at' => $this->resolution_due_at, 'sla_breached' => $this->sla_breached, 'resolved_at' => $this->resolved_at, 'closed_at' => $this->closed_at, 'department' => $this->department, 'category' => $this->category, 'level' => $this->level, 'version' => $this->version, 'created_at' => $this->created_at, 'messages' => TicketMessageResource::collection($this->whenLoaded('messages')), 'attachments' => FileResource::collection($this->whenLoaded('attachments'))];
    }
}
