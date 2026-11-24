<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class SecretGrantResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $this->relationLoaded('user') ? $this->user : null;
        $role = $this->relationLoaded('role') ? $this->role : null;

        return [
            'id' => $this->id,
            'secret_id' => $this->secret_id,
            'user' => $user === null ? null : ['id' => $user->id, 'name' => $user->name],
            'role' => $role === null ? null : ['id' => $role->id, 'code' => $role->code, 'name' => $role->name],
            'reason' => $this->reason,
            'starts_at' => $this->starts_at?->toIso8601String(),
            'expires_at' => $this->expires_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'active' => $this->isActive(),
            'version' => (int) $this->version,
        ];
    }
}
