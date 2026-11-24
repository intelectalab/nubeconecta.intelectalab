<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Shared\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

/**
 * Primer paso del inicio de sesión: credenciales y bloqueo por intentos
 * (security.login_max_attempts / security.login_lockout_minutes).
 * Cuenta bloqueada, deshabilitada, inexistente o contraseña errada responden
 * exactamente igual (422 validation_failed en `email`), para no revelar nada.
 */
final class LoginService
{
    public function __construct(
        private readonly SecurityPolicy $policy,
        private readonly AuditLogger $audit,
    ) {}

    public function attempt(string $email, string $password): User
    {
        // La auditoría del fallo se confirma aunque la petición termine en error.
        $result = DB::transaction(function () use ($email, $password): User|string {
            /** @var User|null $user */
            // Multitenancy Fase 1 (Opción A): se busca el correo en TODAS las
            // organizaciones (sin el filtro global). El correo es único en todo el
            // sistema, así que identifica al usuario y de ahí sale su inquilino.
            $user = User::query()->withoutGlobalScope('organization')->whereRaw('lower(email) = ?', [mb_strtolower(trim($email))])->lockForUpdate()->first();

            if ($user === null) {
                Hash::check($password, self::dummyHash()); // mismo costo que un usuario real: no enumera

                return 'unknown';
            }

            if ($user->locked_until !== null && $user->locked_until->isFuture()) {
                Hash::check($password, self::dummyHash()); // mismo tiempo que una credencial inválida
                $this->audit->record('user.login_failed', 'user', $user->id, null, null, ['reason' => 'locked'], actor: ['type' => 'user', 'id' => $user->id]);

                return 'locked';
            }

            // Multitenancy Fase 1: si el inquilino está suspendido, ninguno de sus
            // usuarios puede iniciar sesión (respuesta idéntica a credencial inválida).
            if (DB::table('organizations')->where('id', $user->organization_id)->value('status') === 'suspended') {
                Hash::check($password, self::dummyHash());
                $this->audit->record('user.login_failed', 'user', $user->id, null, null, ['reason' => 'tenant_suspended'], actor: ['type' => 'user', 'id' => $user->id]);

                return 'tenant_suspended';
            }

            $valid = $user->password_hash !== null && Hash::check($password, $user->password_hash);

            if (! $valid || ! $user->isActive()) {
                $this->registerFailure($user, $valid ? 'disabled' : 'bad_password');

                return 'failed';
            }

            if (Hash::needsRehash($user->password_hash)) {
                $user->forceFill(['password_hash' => Hash::make($password)])->saveQuietly();
            }

            return $user;
        });

        if (! $result instanceof User) {
            throw ValidationException::withMessages(['email' => [__('problems.invalid_credentials')]]);
        }

        return $result;
    }

    /** Hash de relleno con los parámetros Argon2id vigentes (config/hashing.php), calculado una vez por proceso. */
    private static function dummyHash(): string
    {
        static $hash = null;

        return $hash ??= Hash::make(bin2hex(random_bytes(16)));
    }

    private function registerFailure(User $user, string $reason): void
    {
        $count = $user->failed_login_count + 1;
        $data = ['failed_login_count' => $count];
        $metadata = ['reason' => $reason, 'failed_login_count' => $count];

        if ($count >= $this->policy->maxLoginAttempts()) {
            $data = ['failed_login_count' => 0, 'locked_until' => now()->addMinutes($this->policy->lockoutMinutes())];
            $metadata['locked_until'] = $data['locked_until']->toIso8601String();
        }

        $user->forceFill($data)->saveQuietly();
        $this->audit->record('user.login_failed', 'user', $user->id, null, null, $metadata, actor: ['type' => 'user', 'id' => $user->id]);

        if (isset($data['locked_until'])) {
            $this->audit->record('user.locked', 'user', $user->id, null, null, $metadata, actor: ['type' => 'system', 'id' => null]);
        }
    }
}
