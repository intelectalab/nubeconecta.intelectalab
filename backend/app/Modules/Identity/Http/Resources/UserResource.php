<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin User */
final class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'type' => $this->type,
            'name' => $this->name,
            'email' => $this->email,
            'status' => $this->status,
            'locale' => $this->locale,
            'timezone' => $this->timezone,
            'mfa_enabled' => $this->hasMfa(),
            'mfa_method' => $this->mfa_method,
            'must_change_password' => (bool) $this->must_change_password,
            'locked_until' => $this->locked_until?->toIso8601ZuluString(),
            'last_login_at' => $this->last_login_at?->toIso8601ZuluString(),
            'disabled_at' => $this->disabled_at?->toIso8601ZuluString(),
            'roles' => $this->whenLoaded('roles', fn () => $this->roles->map(fn ($role) => [
                'id' => $role->id,
                'code' => $role->code,
                'name' => $role->name,
                'expires_at' => $role->pivot->expires_at ? \Illuminate\Support\Carbon::parse($role->pivot->expires_at)->toIso8601ZuluString() : null,
            ])->values()),
            'version' => $this->version,
            'created_at' => $this->created_at?->toIso8601ZuluString(),
            'updated_at' => $this->updated_at?->toIso8601ZuluString(),
        ];
    }
}
