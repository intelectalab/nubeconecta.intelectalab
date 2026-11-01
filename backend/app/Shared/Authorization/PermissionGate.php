<?php

declare(strict_types=1);

namespace App\Shared\Authorization;

use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/**
 * Chequeo único de permisos (middleware `permission:` y servicios que deciden
 * el permiso en tiempo de ejecución, como la escritura de ajustes): cambio de
 * contraseña pendiente, enrolamiento MFA obligatorio, permiso por rol (403) y MFA reciente si el permiso es sensible.
 */
final class PermissionGate
{
    public function __construct(private readonly AccessControl $access) {}

    public function check(Request $request, string ...$permissions): void
    {
        $user = $request->user() ?? throw new AuthenticationException;

        if ($this->access->mustChangePassword($user)) {
            throw new ProblemException(403, 'password_change_required');
        }
        if ($this->access->mustEnrollMfa($user)) {
            throw ProblemException::mfaRequired();
        }
        foreach ($permissions as $permission) {
            if (! $this->access->allows($user, $permission) && ! $this->impersonatedRead($request, $user, $permission)) {
                throw ProblemException::forbidden();
            }
        }
        foreach ($permissions as $permission) {
            if ($this->access->isSensitive($permission) && ! $this->access->hasRecentMfa($user, $request)) {
                throw ProblemException::mfaRequired();
            }
        }
    }

    /**
     * Vista "ver como cliente" (M-CUS): un staff con la vista activa lee rutas
     * portal.* aunque sus roles no lleven esos permisos (el trigger de BD
     * reserva portal.* a roles de cliente). Solo métodos de lectura.
     */
    private function impersonatedRead(Request $request, Authenticatable $user, string $permission): bool
    {
        return str_starts_with($permission, 'portal.')
            && $request->isMethodSafe()
            && ($user->type ?? null) === 'staff'
            && ImpersonationState::current($request->session()) !== null;
    }
}
