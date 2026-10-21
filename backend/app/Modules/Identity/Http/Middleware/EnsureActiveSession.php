<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Middleware;

use App\Models\User;
use App\Modules\Identity\Services\AuthSessionManager;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * Tras auth:sanctum: un usuario deshabilitado o borrado, o una fila de
 * user_sessions revocada o vencida, responde 401 al instante (cierre remoto).
 */
final class EnsureActiveSession
{
    public function __construct(private readonly AuthSessionManager $sessions) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if (! $user instanceof User || ! $user->isActive()) {
            $this->kick($request);
        }

        $session = $this->sessions->current($request);
        if ($request->hasSession() && $request->session()->has(AuthSessionManager::SESSION_KEY)) {
            if ($session === null || ! $session->isActive() || $session->user_id !== $user->id) {
                $this->kick($request);
            }
            if ($session->last_activity_at === null || $session->last_activity_at->lt(now()->subMinute())) {
                $session->forceFill(['last_activity_at' => now()])->saveQuietly();
            }
        }

        return $next($request);
    }

    private function kick(Request $request): never
    {
        Auth::guard('web')->logout();
        Auth::forgetGuards(); // también el guard sanctum, que memoriza el usuario
        if ($request->hasSession()) {
            $request->session()->invalidate();
        }

        throw new AuthenticationException;
    }
}
