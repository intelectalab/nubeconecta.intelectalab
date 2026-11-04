<?php

declare(strict_types=1);

namespace App\Modules\Support\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ComplaintResponseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return ['id' => $this->id, 'complaint_id' => $this->complaint_id, 'body' => $this->body, 'template_id' => $this->template_id, 'previewed_at' => $this->previewed_at, 'responded_by' => $this->responded_by, 'sent_to_email' => $this->sent_to_email, 'sent_at' => $this->sent_at, 'file_id' => $this->file_id, 'is_final' => $this->is_final];
    }
}
