<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Enlace de un solo uso SIN el token ni el payload (esos nunca se devuelven en listado). */
final class OneTimeLinkResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'purpose' => $this->purpose,
            'secret_id' => $this->secret_id,
            'recipient_email' => $this->recipient_email,
            'max_views' => (int) $this->max_views,
            'views_count' => (int) $this->views_count,
            'expires_at' => $this->expires_at?->toIso8601String(),
            'consumed_at' => $this->consumed_at?->toIso8601String(),
            'revoked_at' => $this->revoked_at?->toIso8601String(),
            'usable' => $this->isUsable(),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
