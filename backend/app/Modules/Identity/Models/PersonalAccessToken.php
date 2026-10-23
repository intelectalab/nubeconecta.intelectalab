<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Shared\Organization\CurrentOrganization;
use Laravel\Sanctum\PersonalAccessToken as SanctumToken;

/**
 * Token Sanctum sobre la tabla canónica `personal_access_tokens`, que agrega
 * `organization_id` (obligatorio) y `customer_id`. Vencen a
 * `sanctum.expiration` minutos (SANCTUM_EXPIRATION) o antes si `expires_at`
 * lo indica; `sanctum:prune-expired` (programado a diario) borra los vencidos.
 */
class PersonalAccessToken extends SanctumToken
{
    protected static function booted(): void
    {
        static::creating(static function (self $token): void {
            $token->organization_id ??= app(CurrentOrganization::class)->id();
        });
    }
}
