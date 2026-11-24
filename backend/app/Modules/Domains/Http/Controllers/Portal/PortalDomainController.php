<?php

declare(strict_types=1);

namespace App\Modules\Domains\Http\Controllers\Portal;

use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Domains\Http\Resources\PortalDomainResource;
use App\Modules\Domains\Models\Domain;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** /api/v1/portal/domains (portal.domain.view): solo los dominios del cliente de la sesión; uno ajeno responde 404. */
final class PortalDomainController
{
    public function index(Request $request): JsonResponse
    {
        $query = Domain::query()
            ->with(['service:id,code,label,status,commercial_due_date'])
            ->where('customer_id', PortalCustomer::id($request));

        return CursorPagination::respond($query, $request, ['created_at', 'name', 'registry_expires_at', 'status'], PortalDomainResource::class);
    }

    public function show(Request $request, string $id): PortalDomainResource
    {
        $domain = Domain::query()
            ->with(['service:id,code,label,status,commercial_due_date'])
            ->where('customer_id', PortalCustomer::id($request))
            ->findOrFail($id);

        return new PortalDomainResource($domain);
    }
}
