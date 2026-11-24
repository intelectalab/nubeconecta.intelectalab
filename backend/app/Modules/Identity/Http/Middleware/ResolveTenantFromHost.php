<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Middleware;

use App\Shared\Organization\CurrentOrganization;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * Multitenancy Fase 2: fija la organización operadora de la petición a partir
 * del host `<subdomain>.<HUB_TENANT_BASE_DOMAIN>`, ANTES de autenticar. Así el
 * contenido público por inquilino (p. ej. el branding del login) es el del
 * inquilino del subdominio.
 *
 * Para peticiones autenticadas, SetCurrentOrganization (post-auth) vuelve a fijar
 * la organización a la del usuario, así que esto solo decide el contexto público.
 * Desactivado si HUB_TENANT_BASE_DOMAIN está vacío (requiere DNS wildcard).
 */
final class ResolveTenantFromHost
{
    public function __construct(private readonly CurrentOrganization $current) {}

    public function handle(Request $request, Closure $next): Response
    {
        $base = strtolower(trim((string) config('hub.tenancy.base_domain', '')));
        if ($base !== '') {
            $host = strtolower($request->getHost());
            if ($host !== $base && str_ends_with($host, '.'.$base)) {
                $label = substr($host, 0, -(strlen($base) + 1));
                if ($label !== '' && ! str_contains($label, '.') && preg_match('/^[a-z0-9][a-z0-9-]{0,40}$/', $label) === 1) {
                    $orgId = DB::table('organizations')->where('subdomain', $label)
                        ->whereNull('deleted_at')->where('status', 'active')->value('id');
                    if ($orgId !== null) {
                        $this->current->set((string) $orgId);
                    }
                }
            }
        }

        return $next($request);
    }
}
