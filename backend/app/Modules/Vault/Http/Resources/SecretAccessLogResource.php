<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

final class SecretAccessLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $this->relationLoaded('user') ? $this->user : null;

        return [
            'id' => $this->id,
            'secret_id' => $this->secret_id,
            'user' => $user === null ? null : ['id' => $user->id, 'name' => $user->name],
            'action' => $this->action,
            'reason' => $this->reason,
            'ip' => $this->ip,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
