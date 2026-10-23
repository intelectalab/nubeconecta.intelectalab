<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Modules\Identity\Models\Role;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Support\Facades\DB;

/**
 * Protege el rol `admin` del sistema contra el bloqueo de la organización:
 * no puede perder los permisos mínimos de administración de accesos
 * (config hub.identity.admin_minimum_permissions) y siempre debe quedar al
 * menos un usuario del personal activo con el rol vigente. Se llama dentro de
 * la transacción de cada cambio (postcondición); bloquea la fila del rol para
 * serializar cambios concurrentes. Responde 409 `admin_role_protected`.
 */
final class SystemAdminGuard
{
    public const ROLE = 'admin';

    /** @param list<string> $permissions conjunto final de permisos del rol */
    public function assertKeepsMinimumPermissions(Role $role, array $permissions): void
    {
        if ($role->code !== self::ROLE) {
            return;
        }
        $missing = array_values(array_diff((array) config('hub.identity.admin_minimum_permissions', []), $permissions));
        if ($missing !== []) {
            throw new ProblemException(409, 'admin_role_protected', 'El rol de administrador del sistema no puede perder los permisos mínimos: '.implode(', ', $missing).'.', ['missing_permissions' => $missing]);
        }
    }

    /** Postcondición: queda al menos un usuario activo con el rol admin vigente. */
    public function assertActiveAdminRemains(): void
    {
        $role = Role::query()->where('code', self::ROLE)->lockForUpdate()->first();
        if ($role === null) {
            return;
        }
        $active = DB::table('user_roles as ur')->join('users as u', 'u.id', '=', 'ur.user_id')
            ->where('ur.role_id', $role->id)
            ->where(fn ($q) => $q->whereNull('ur.expires_at')->orWhere('ur.expires_at', '>', now()))
            ->where('u.type', 'staff')->where('u.status', 'active')->whereNull('u.deleted_at')
            ->exists();
        if (! $active) {
            throw new ProblemException(409, 'admin_role_protected', 'Debe quedar al menos un usuario activo con el rol de administrador.');
        }
    }
}
