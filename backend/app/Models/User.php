<?php

declare(strict_types=1);

namespace App\Models;

use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Models\UserSession;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\HasApiTokens;

/**
 * Usuario del personal o de cliente sobre la tabla canónica `users`
 * (database/schema.sql): id uuid, password_hash Argon2id, mfa_* y bloqueo por intentos.
 * Pertenece al módulo Identity; se mantiene en App\Models por convención de Laravel
 * (auth.providers.users.model, Sanctum).
 *
 * @property string $id
 * @property string $organization_id
 * @property string $type
 * @property ?string $password_hash
 * @property ?string $mfa_secret
 * @property ?string $mfa_method
 * @property ?\Illuminate\Support\Carbon $mfa_enabled_at
 * @property ?\Illuminate\Support\Carbon $locked_until
 * @property int $failed_login_count
 * @property int $version
 */
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use BelongsToOrganization, HasApiTokens, HasFactory, HasUuids, Notifiable, SoftDeletes, TracksVersionAndActor;

    protected $fillable = ['name', 'email', 'type', 'locale', 'timezone'];

    protected $hidden = ['password_hash', 'mfa_secret'];

    protected $attributes = ['type' => 'staff', 'status' => 'active', 'failed_login_count' => 0, 'version' => 1];

    /** @var list<string>|null */
    private ?array $permissionCodesMemo = null;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password_changed_at' => 'datetime',
            'mfa_secret' => 'encrypted',
            'mfa_enabled_at' => 'datetime',
            'locked_until' => 'datetime',
            'last_login_at' => 'datetime',
            'disabled_at' => 'datetime',
            'must_change_password' => 'boolean',
            'failed_login_count' => 'integer',
            'version' => 'integer',
        ];
    }

    public function getAuthPasswordName(): string
    {
        return 'password_hash';
    }

    /** La tabla canónica no tiene remember_token: la sesión la da Sanctum/cookie. */
    public function getRememberTokenName(): string
    {
        return '';
    }

    public function roles(): BelongsToMany
    {
        return $this->belongsToMany(Role::class, 'user_roles')
            ->withPivot(['id', 'expires_at', 'organization_id'])
            ->withTimestamps();
    }

    public function sessions(): HasMany
    {
        return $this->hasMany(UserSession::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && $this->deleted_at === null;
    }

    public function hasMfa(): bool
    {
        return $this->mfa_enabled_at !== null && $this->mfa_method !== null;
    }

    /** Códigos de permiso de los roles vigentes (user_roles.expires_at). Se memoriza por instancia. */
    public function permissionCodes(): array
    {
        return $this->permissionCodesMemo ??= DB::table('user_roles as ur')
            ->join('roles as r', 'r.id', '=', 'ur.role_id')
            ->join('role_permissions as rp', 'rp.role_id', '=', 'r.id')
            ->join('permissions as p', 'p.id', '=', 'rp.permission_id')
            ->where('ur.user_id', $this->getKey())
            ->where('r.organization_id', $this->organization_id)
            ->where(fn ($q) => $q->whereNull('ur.expires_at')->orWhere('ur.expires_at', '>', now()))
            ->distinct()
            ->orderBy('p.code')
            ->pluck('p.code')
            ->all();
    }

    /** @return list<string> */
    public function activeRoleCodes(): array
    {
        return $this->roles()
            ->where(fn ($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()))
            ->pluck('roles.code')
            ->all();
    }

    public function forgetPermissionCache(): void
    {
        $this->permissionCodesMemo = null;
    }
}
