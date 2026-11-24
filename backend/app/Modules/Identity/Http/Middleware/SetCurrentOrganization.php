<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Middleware;

use App\Models\User;
use App\Shared\Organization\CurrentOrganization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Multitenancy Fase 1 (Opción A). Tras auth:sanctum, fija la organización
 * operadora de la petición a la del usuario autenticado, de modo que el filtro
 * global por organización aísle sus datos durante todo el resto del request.
 *
 * Va en el grupo hub.auth ENTRE auth:sanctum y session.active: session.active
 * consulta user_sessions (scopeado), así que la organización debe quedar fijada
 * antes. El usuario lo resuelve el TenantUserProvider sin scope (el id es global).
 */
final class SetCurrentOrganization
{
    public function __construct(private readonly CurrentOrganization $current) {}

    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user instanceof User) {
            $this->current->set($user->organization_id);
        }

        return $next($request);
    }
}
