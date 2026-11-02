<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class ServiceTypeFieldResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'service_type_id' => $this->service_type_id, 'key' => $this->key,
            'label' => $this->label, 'help_text' => $this->help_text, 'field_type' => $this->field_type,
            'options' => $this->options, 'validation' => $this->validation, 'is_required' => $this->is_required,
            'filled_by' => $this->filled_by, 'position' => $this->position, 'is_active' => $this->is_active,
            'version' => $this->version,
        ];
    }
}
