<?php

declare(strict_types=1);

namespace App\Modules\Vault\Models;

use App\Models\User;
use App\Modules\Identity\Models\Role;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Concesión de acceso a un secreto para un usuario o un rol (tabla
 * `secret_grants`). Temporal (expires_at opcional) y revocable al instante.
 */
class SecretGrant extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $table = 'secret_grants';

    protected $fillable = ['secret_id', 'user_id', 'role_id', 'reason', 'starts_at', 'expires_at'];

    protected $attributes = ['version' => 1];

    protected function casts(): array
    {
        return [
            'starts_at' => 'datetime',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function role(): BelongsTo
    {
        return $this->belongsTo(Role::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null
            && ($this->expires_at === null || $this->expires_at->isFuture())
            && $this->starts_at->isPast();
    }
}
