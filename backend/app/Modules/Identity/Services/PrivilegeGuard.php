<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Models\Role;
use App\Shared\Http\Problem\ProblemException;

/**
 * Anti escalada de privilegios: nadie otorga (a un rol o, vía roles, a un
 * usuario) un permiso que no tiene, ni administra a un usuario con permisos que
 * él no tiene. El administrador del sistema tiene todos, así que no le afecta.
 * Regla propia de seguridad (los docs no la nombran); responde 403 forbidden.
 */
final class PrivilegeGuard
{
    /** @param iterable<string> $codes */
    public function assertCanGrant(User $actor, iterable $codes): void
    {
        $codes = array_values(is_array($codes) ? $codes : iterator_to_array($codes, false));
        // portal.* solo existe en roles de cliente (trigger hub_role_permission_audience): ningún
        // usuario del personal los tiene, y otorgarlos no da acceso al panel. Se controlan con
        // el propio permiso identity.role.* / identity.user.* de la ruta.
        $codes = array_filter($codes, static fn (string $code): bool => ! str_starts_with($code, 'portal.'));
        $missing = array_diff($codes, $actor->permissionCodes());
        if ($missing !== []) {
            throw ProblemException::forbidden('No puede otorgar permisos que usted no tiene: '.implode(', ', array_slice(array_values($missing), 0, 10)).'.');
        }
    }

    /** @param iterable<Role> $roles */
    public function assertCanAssignRoles(User $actor, iterable $roles): void
    {
        foreach ($roles as $role) {
            $this->assertCanGrant($actor, $role->permissions()->pluck('permissions.code')->all());
        }
    }

    public function assertCanManage(User $actor, User $target): void
    {
        if ($actor->id !== $target->id) {
            $this->assertCanGrant($actor, $target->permissionCodes());
        }
    }
}
