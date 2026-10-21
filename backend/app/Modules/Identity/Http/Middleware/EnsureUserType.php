<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Middleware;

use App\Shared\Http\Problem\ProblemException;
use Closure;
use Illuminate\Auth\AuthenticationException;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * `user.type:<staff|customer>`: separa el panel del portal. Un usuario de
 * cliente (`customer`) no entra a /admin aunque un rol le diera permisos, y
 * viceversa cuando existan las rutas /portal (M-IDN: tipos staff/customer).
 */
final class EnsureUserType
{
    public function handle(Request $request, Closure $next, string ...$types): Response
    {
        $user = $request->user() ?? throw new AuthenticationException;

        if (! in_array($user->type, $types, true)) {
            throw ProblemException::forbidden();
        }

        return $next($request);
    }
}
