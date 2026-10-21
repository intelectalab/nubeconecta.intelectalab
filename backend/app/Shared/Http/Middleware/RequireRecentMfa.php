<?php

declare(strict_types=1);

namespace App\Shared\Http\Middleware;

use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** Uso: ->middleware('mfa.recent') en acciones sensibles que no dependen de un permiso concreto. */
final class RequireRecentMfa
{
    public function __construct(private readonly AccessControl $access) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user() ?? throw new AuthenticationException;

        if (! $this->access->hasRecentMfa($user, $request)) {
            throw ProblemException::mfaRequired();
        }

        return $next($request);
    }
}
