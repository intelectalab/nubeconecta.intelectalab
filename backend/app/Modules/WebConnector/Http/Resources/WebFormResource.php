<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class WebFormResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'brand_id' => $this->brand_id,
            'code' => $this->code,
            'name' => $this->name,
            'status' => $this->status,
            'destination' => $this->destination,
            'lead_channel_id' => $this->lead_channel_id,
            'ticket_type' => $this->ticket_type,
            'ticket_department' => $this->ticket_department,
            'notify_email' => $this->notify_email,
            'owner_user_id' => $this->owner_user_id,
            'consent_required' => (bool) $this->consent_required,
            'consent_purpose' => $this->consent_purpose,
            'consent_text' => $this->consent_text ?: new \stdClass,
            'captcha_required' => (bool) $this->captcha_required,
            'success_message' => $this->success_message ?: new \stdClass,
            'redirect_url' => $this->redirect_url,
            'fields_count' => $this->whenCounted('fields'),
            'fields' => $this->whenLoaded('fields', fn () => $this->fields->map(fn ($f) => [
                'id' => $f->id,
                'key' => $f->key,
                'label' => $f->label ?: new \stdClass,
                'help_text' => $f->help_text ?: new \stdClass,
                'field_type' => $f->field_type,
                'is_required' => (bool) $f->is_required,
                'options' => $f->options ?: [],
                'validation' => $f->validation ?: new \stdClass,
                'maps_to' => $f->maps_to,
                'position' => (int) $f->position,
            ])->all()),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
