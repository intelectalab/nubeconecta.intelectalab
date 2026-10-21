<?php

declare(strict_types=1);

namespace App\Shared\Contracts;

use Illuminate\Contracts\Auth\Authenticatable;
use Illuminate\Http\Request;

/**
 * Puerto de autorización que usan los middleware compartidos. Lo implementa el
 * módulo Identity (roles, role_permissions, user_sessions); así app/Shared no
 * depende de modelos de ningún módulo.
 */
interface AccessControl
{
    /** El usuario tiene el permiso `<modulo>.<entidad>.<accion>` por alguno de sus roles vigentes. */
    public function allows(Authenticatable $user, string $permission): bool;

    /** La política exige segundo factor y el usuario aún no lo activó: solo puede enrolarse. */
    public function mustEnrollMfa(Authenticatable $user): bool;

    /** Contraseña puesta por un administrador (must_change_password) o vencida (security.password.expiry_days): solo puede cambiarla. */
    public function mustChangePassword(Authenticatable $user): bool;

    /** El permiso exige MFA reciente (permissions.is_sensitive, lista mfa_recent de roles.json). */
    public function isSensitive(string $permission): bool;

    /** La sesión actual verificó el segundo factor hace menos de security.sensitive_action_mfa_max_age_minutes. */
    public function hasRecentMfa(Authenticatable $user, Request $request): bool;
}
