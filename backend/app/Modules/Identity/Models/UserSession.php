<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Models\User;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Sesión del panel o del portal (tabla `user_sessions`). `mfa_verified_at`
 * alimenta la regla de MFA reciente; `revoked_at` es el cierre remoto.
 *
 * @property string $id
 * @property ?\Illuminate\Support\Carbon $mfa_verified_at
 * @property \Illuminate\Support\Carbon $expires_at
 * @property ?\Illuminate\Support\Carbon $revoked_at
 */
class UserSession extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $fillable = ['user_id', 'session_token_hash', 'ip', 'user_agent', 'device_label', 'mfa_verified_at', 'last_activity_at', 'expires_at'];

    protected $hidden = ['session_token_hash'];

    protected function casts(): array
    {
        return [
            'mfa_verified_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'expires_at' => 'datetime',
            'revoked_at' => 'datetime',
            'version' => 'integer',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->revoked_at === null && $this->expires_at->isFuture();
    }
}
