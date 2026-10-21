<?php

declare(strict_types=1);

namespace App\Shared\Http\Middleware;

use App\Shared\Authorization\PermissionGate;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** `permission:<codigo>[,<codigo>...]`: delega en PermissionGate (401/403/mfa_required). */
final class RequirePermission
{
    public function __construct(private readonly PermissionGate $gate) {}

    public function handle(Request $request, Closure $next, string ...$permissions): Response
    {
        $this->gate->check($request, ...$permissions);

        return $next($request);
    }
}
