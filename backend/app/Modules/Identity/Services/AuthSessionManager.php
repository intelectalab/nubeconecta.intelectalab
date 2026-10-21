<?php

declare(strict_types=1);

namespace App\Modules\Identity\Services;

use App\Models\User;
use App\Modules\Identity\Models\UserSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Str;

/**
 * Sesiones del panel y del portal: inicia la sesión de Sanctum (guard web) y
 * registra la fila en user_sessions, cuya id se guarda en la sesión de Laravel.
 */
final class AuthSessionManager
{
    public const SESSION_KEY = 'hub.user_session_id';

    public const MFA_PENDING_KEY = 'hub.mfa_pending';

    public function __construct(private readonly SecurityPolicy $policy) {}

    public function start(User $user, Request $request, bool $mfaVerified): UserSession
    {
        Auth::guard('web')->login($user);
        if ($request->hasSession()) {
            $request->session()->regenerate();
            $request->session()->forget(self::MFA_PENDING_KEY);
        }

        $session = UserSession::query()->create([
            'user_id' => $user->id,
            'organization_id' => $user->organization_id,
            'session_token_hash' => hash('sha256', $request->hasSession() ? $request->session()->getId() : Str::random(40)),
            'ip' => $request->ip(),
            'user_agent' => Str::limit((string) $request->userAgent(), 500, '') ?: null,
            'device_label' => null,
            'mfa_verified_at' => $mfaVerified ? now() : null,
            'last_activity_at' => now(),
            'expires_at' => now()->addHours($this->policy->sessionHours()),
        ]);

        if ($request->hasSession()) {
            $request->session()->put(self::SESSION_KEY, $session->id);
        }

        $user->forceFill(['last_login_at' => now(), 'failed_login_count' => 0, 'locked_until' => null])->saveQuietly();

        return $session;
    }

    public function current(Request $request): ?UserSession
    {
        if (! $request->hasSession()) {
            return null;
        }
        $id = $request->session()->get(self::SESSION_KEY);

        return is_string($id) ? UserSession::query()->find($id) : null;
    }

    public function markMfaVerified(Request $request): void
    {
        $this->current($request)?->forceFill(['mfa_verified_at' => now()])->save();
    }

    public function end(Request $request): void
    {
        $this->current($request)?->forceFill(['revoked_at' => now()])->save();
        Auth::guard('web')->logout();
        Auth::forgetGuards(); // también el guard sanctum, que memoriza el usuario
        if ($request->hasSession()) {
            $request->session()->invalidate();
            $request->session()->regenerateToken();
        }
    }

    /** Cierre remoto de todas las sesiones del usuario (baja, deshabilitar). */
    public function revokeAll(User $user): int
    {
        return UserSession::query()->where('user_id', $user->id)->whereNull('revoked_at')
            ->update(['revoked_at' => now(), 'updated_at' => now()]);
    }
}
