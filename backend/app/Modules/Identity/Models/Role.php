<?php

declare(strict_types=1);

namespace App\Modules\Identity\Models;

use App\Models\User;
use App\Shared\Database\Concerns\BelongsToOrganization;
use App\Shared\Database\Concerns\TracksVersionAndActor;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

/**
 * Rol por organización (tabla `roles`). Los de sistema (is_system) los protege
 * además el trigger hub_role_guard(); un rol `customer` solo admite permisos portal.*.
 *
 * @property string $id
 * @property string $code
 * @property string $audience
 * @property bool $is_system
 * @property int $version
 */
class Role extends Model
{
    use BelongsToOrganization, HasUuids, TracksVersionAndActor;

    protected $fillable = ['code', 'name', 'description', 'audience'];

    protected $attributes = ['is_system' => false, 'version' => 1];

    protected function casts(): array
    {
        return ['is_system' => 'boolean', 'version' => 'integer'];
    }

    public function permissions(): BelongsToMany
    {
        return $this->belongsToMany(Permission::class, 'role_permissions')
            ->withPivot(['id', 'organization_id'])
            ->withTimestamps();
    }

    public function users(): BelongsToMany
    {
        return $this->belongsToMany(User::class, 'user_roles')->withPivot(['expires_at'])->withTimestamps();
    }

    /**
     * Reemplaza los permisos del rol por los indicados (ids).
     *
     * @param  list<string>  $permissionIds
     */
    public function syncPermissionIds(array $permissionIds): void
    {
        $pivot = ['organization_id' => $this->organization_id, 'created_by' => auth()->id()];
        $this->permissions()->sync(array_fill_keys($permissionIds, $pivot));
    }
}
