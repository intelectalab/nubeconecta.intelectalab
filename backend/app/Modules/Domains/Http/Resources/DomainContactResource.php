<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class DomainContactResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id, 'domain_id' => $this->domain_id, 'role' => $this->role, 'name' => $this->name,
            'company' => $this->company, 'email' => $this->email, 'phone' => $this->phone,
            'address' => (object) ($this->address ?? []), 'synced_at' => $this->synced_at?->toIso8601String(),
            'version' => (int) $this->version, 'created_at' => $this->created_at?->toIso8601String(), 'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
