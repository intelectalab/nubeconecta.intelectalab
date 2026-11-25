<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Solicitud de restauración con su servicio y ticket asociados. */
final class RestoreRequestResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'customer_id' => $this->customer_id,
            'service_id' => $this->service_id,
            'hosting_account_id' => $this->hosting_account_id,
            'target_kind' => $this->target_kind,
            'target_name' => $this->target_name,
            'restore_point_at' => $this->restore_point_at?->toIso8601String(),
            'requested_via' => $this->requested_via,
            'requested_by' => $this->requested_by,
            'overwrite_confirmed' => (bool) $this->overwrite_confirmed,
            'status' => $this->status,
            'ticket_id' => $this->ticket_id,
            'approved_at' => $this->approved_at?->toIso8601String(),
            'rejection_reason' => $this->rejection_reason,
            'execution_mode' => $this->execution_mode,
            'started_at' => $this->started_at?->toIso8601String(),
            'completed_at' => $this->completed_at?->toIso8601String(),
            'result_notes' => $this->result_notes,
            'service' => $this->whenLoaded('service', fn () => $this->service ? ['id' => $this->service->id, 'label' => $this->service->label, 'code' => $this->service->code] : null),
            'ticket' => $this->whenLoaded('ticket', fn () => $this->ticket ? ['id' => $this->ticket->id, 'number' => $this->ticket->number, 'status' => $this->ticket->status] : null),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? ['id' => $this->customer->id, 'legal_name' => $this->customer->legal_name, 'trade_name' => $this->customer->trade_name] : null),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
