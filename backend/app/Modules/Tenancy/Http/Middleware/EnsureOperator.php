<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Http\Middleware;

use App\Modules\Identity\Models\Organization;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Frontera del operador (multitenancy Fase 1): solo la organización operadora
 * (is_operator) gestiona inquilinos y planes. Un superadministrador de un
 * inquilino cualquiera NO puede tocar la plataforma aunque tenga el permiso.
 * Va después de hub.auth (la organización ya está fijada al usuario).
 */
final class EnsureOperator
{
    public function __construct(private readonly CurrentOrganization $current) {}

    public function handle(Request $request, Closure $next): Response
    {
        $isOperator = (bool) Organization::query()->whereKey($this->current->id())->value('is_operator');
        if (! $isOperator) {
            throw ProblemException::forbidden('Solo la organización operadora gestiona la plataforma SaaS.');
        }

        return $next($request);
    }
}
