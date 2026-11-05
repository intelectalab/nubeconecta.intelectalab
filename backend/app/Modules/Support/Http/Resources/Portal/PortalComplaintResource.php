<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources\Portal;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class PortalComplaintResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'code' => $this->code,
            'complaint_type' => $this->complaint_type,
            'status' => $this->status,
            'received_at' => $this->received_at,
            'due_at' => $this->due_at,
            'response_days' => $this->response_days,
            'consumer_name' => $this->consumer_name,
            'consumer_email' => $this->consumer_email,
            'service_description' => $this->service_description,
            'detail' => $this->detail,
            'consumer_request' => $this->consumer_request,
            'amount_minor' => $this->amount_minor,
            'currency' => $this->currency,
            'answered_at' => $this->answered_at,
            'closed_at' => $this->closed_at,
            'responses' => PortalComplaintResponseResource::collection($this->whenLoaded('responses')),
        ];
    }
}
