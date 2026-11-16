<?php

declare(strict_types=1);

namespace App\Modules\Mail\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class MailDnsCheckResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'mail_service_id' => $this->mail_service_id, 'record_type' => $this->record_type,
            'expected' => $this->expected, 'observed' => $this->observed, 'result' => $this->result,
            'checked_at' => $this->checked_at?->toIso8601String(),
        ];
    }
}
