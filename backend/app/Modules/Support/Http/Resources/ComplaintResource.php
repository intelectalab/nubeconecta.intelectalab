<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ComplaintResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'brand_id' => $this->brand_id, 'number' => $this->number, 'code' => $this->code, 'complaint_type' => $this->complaint_type, 'consumer_name' => $this->consumer_name, 'consumer_document_type' => $this->consumer_document_type, 'consumer_document_number' => $this->consumer_document_number, 'consumer_address' => $this->consumer_address, 'consumer_email' => $this->consumer_email, 'consumer_phone' => $this->consumer_phone, 'is_minor' => $this->is_minor, 'guardian_name' => $this->guardian_name, 'customer_id' => $this->customer_id, 'service_id' => $this->service_id, 'service_description' => $this->service_description, 'amount_minor' => $this->amount_minor, 'currency' => $this->currency, 'detail' => $this->detail, 'consumer_request' => $this->consumer_request, 'status' => $this->status, 'received_at' => $this->received_at, 'response_days' => $this->response_days, 'due_at' => $this->due_at, 'ticket_id' => $this->ticket_id, 'answered_at' => $this->answered_at, 'closed_at' => $this->closed_at, 'is_test' => $this->is_test, 'test_reason' => $this->test_reason, 'version' => $this->version, 'responses' => ComplaintResponseResource::collection($this->whenLoaded('responses'))];
    }
}
