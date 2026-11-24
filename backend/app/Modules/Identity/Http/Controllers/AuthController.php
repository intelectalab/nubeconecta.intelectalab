<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Models\User;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Modules\Identity\Services\LoginService;
use App\Modules\Identity\Services\MfaService;
use App\Modules\Identity\Services\PasswordService;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Shared\Audit\AuditLogger;
use App\Shared\Authorization\ImpersonationState;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * /api/v1/auth: login en dos pasos (credenciales → MFA si el usuario lo tiene
 * activo), logout y me. Sanctum SPA: el cliente pide antes GET /sanctum/csrf-cookie.
 */
final class AuthController
{
    public function __construct(
        private readonly AuthSessionManager $sessions,
        private readonly SecurityPolicy $policy,
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
    ) {}

    public function login(Request $request, LoginService $login): JsonResponse
    {
        $data = $request->validate([
            'email' => ['required', 'string', 'email', 'max:255'],
            'password' => ['required', 'string', 'max:1024'],
        ]);

        $user = $login->attempt($data['email'], $data['password']);

        // Multitenancy Fase 1: el login resolvió al usuario sin scope; fijamos su
        // organización para que el resto del request (sesión, me, permisos) aísle
        // correctamente sus datos.
        $this->organization->set($user->organization_id);

        if ($user->hasMfa()) {
            $request->session()->put(AuthSessionManager::MFA_PENDING_KEY, [
                'user_id' => $user->id,
                'expires_at' => now()->addMinutes((int) config('hub.auth.mfa_pending_minutes'))->getTimestamp(),
            ]);

            return response()->json(['data' => ['mfa_required' => true, 'methods' => [$user->mfa_method, 'recovery']]]);
        }

        $this->sessions->start($user, $request, mfaVerified: false);
        $this->audit->record('user.logged_in', 'user', $user->id, null, null, ['mfa' => false]);

        return response()->json(['data' => ['mfa_required' => false, 'user' => $this->mePayload($user, $request)]]);
    }

    public function verifyMfa(Request $request, MfaService $mfa): JsonResponse
    {
        $data = $request->validate([
            'method' => ['required', Rule::in(['totp', 'recovery'])],
            'code' => ['required', 'string', 'max:64'],
        ]);

        $pending = $request->session()->get(AuthSessionManager::MFA_PENDING_KEY);
        // Multitenancy Fase 1: el usuario pendiente puede ser de cualquier inquilino;
        // se resuelve sin el filtro global (su id es único en todo el sistema).
        $user = is_array($pending) && ($pending['expires_at'] ?? 0) > now()->getTimestamp()
            ? User::query()->withoutGlobalScope('organization')->find($pending['user_id'])
            : null;

        if ($user === null || ! $user->isActive() || ! $user->hasMfa()) {
            $request->session()->forget(AuthSessionManager::MFA_PENDING_KEY);
            throw ValidationException::withMessages(['code' => [__('problems.invalid_credentials')]]);
        }

        // Fijada la organización del usuario antes de crear la sesión y el payload.
        $this->organization->set($user->organization_id);

        // Incremento atómico (Redis INCR): cuenta el intento ANTES de verificar y decide
        // con el valor devuelto, cerrando la carrera entre comprobar y registrar — varios
        // intentos concurrentes ya no pueden exceder mfa_max_attempts (fuerza bruta del código).
        $limiterKey = 'identity:mfa-verify:'.$user->id;
        $attempts = RateLimiter::hit($limiterKey, (int) config('hub.auth.mfa_pending_minutes') * 60);
        if ($attempts > (int) config('hub.auth.mfa_max_attempts')) {
            $request->session()->forget(AuthSessionManager::MFA_PENDING_KEY);
            throw ValidationException::withMessages(['code' => [__('problems.invalid_mfa_code')]]);
        }

        $ok = $data['method'] === 'recovery'
            ? $mfa->verifyRecoveryCode($user, $data['code'])
            : $mfa->verifyTotp($user, $data['code']);

        if (! $ok) {
            $this->audit->record('user.mfa_failed', 'user', $user->id, null, null, ['method' => $data['method']], actor: ['type' => 'user', 'id' => $user->id]);
            throw ValidationException::withMessages(['code' => [__('problems.invalid_mfa_code')]]);
        }

        RateLimiter::clear($limiterKey);
        $this->sessions->start($user, $request, mfaVerified: true);
        $this->audit->record('user.logged_in', 'user', $user->id, null, null, ['mfa' => true, 'method' => $data['method']]);

        return response()->json(['data' => ['mfa_required' => false, 'user' => $this->mePayload($user, $request)]]);
    }

    public function logout(Request $request): Response
    {
        $user = $request->user();
        $this->audit->record('user.logged_out', 'user', $user?->getAuthIdentifier());
        $this->sessions->end($request);

        return response()->noContent();
    }

    public function me(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        return response()->json(['data' => $this->mePayload($user, $request)]);
    }

    /** GET /auth/password-policy: reglas vigentes para el formulario de cambio. */
    public function passwordPolicy(): JsonResponse
    {
        return response()->json(['data' => [
            'min_length' => $this->policy->passwordMinLength(),
            'complexity' => $this->policy->passwordComplexity(),
            'expiry_days' => $this->policy->passwordExpiryDays(),
            'history_count' => $this->policy->passwordHistoryCount(),
        ]]);
    }

    /** POST /auth/password/change: contraseña actual + nueva según la política. */
    public function changePassword(Request $request, PasswordService $passwords): Response
    {
        $data = $request->validate([
            'current_password' => ['required', 'string', 'max:1024'],
            'password' => ['required', 'string', 'max:1024', 'confirmed', $this->policy->passwordRule()],
        ]);
        /** @var User $user */
        $user = $request->user();
        $passwords->change($user, $data['current_password'], $data['password'], $request);

        return response()->noContent();
    }

    /** @return array<string, mixed> */
    private function mePayload(User $user, Request $request): array
    {
        $required = $this->policy->mfaRequiredFor($user);

        return (new UserResource($user->load('roles')))->resolve() + [
            'permissions' => $user->permissionCodes(),
            'mfa' => [
                'enabled' => $user->hasMfa(),
                'method' => $user->mfa_method,
                'required' => $required,
                'enrollment_required' => $required && ! $user->hasMfa(),
            ],
            'password' => ['change_required' => $this->policy->passwordChangeRequired($user)],
            // Vista "ver como cliente" activa en esta sesión (el portal la muestra como banner de solo lectura).
            'impersonation' => $user->type === 'staff' ? ImpersonationState::current($request->session()) : null,
        ];
    }
}
