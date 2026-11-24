<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Controllers\Portal;

use App\Modules\Contracts\Http\Resources\PortalContractResource;
use App\Modules\Contracts\Models\Contract;
use App\Modules\Customers\Support\PortalCustomer;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** /api/v1/portal/contracts (portal.contract.view): solo los contratos del cliente de la sesión; uno ajeno responde 404. */
final class PortalContractController
{
    /** Estados visibles para el cliente: no ve los internos de preparación (draft, in_review, approved). */
    private const VISIBLE_STATUSES = ['sent', 'signed_active', 'expired', 'terminated'];

    public function index(Request $request): JsonResponse
    {
        $query = Contract::query()
            ->with(['brand:id,name'])
            ->where('customer_id', PortalCustomer::id($request))
            ->whereIn('status', self::VISIBLE_STATUSES);

        return CursorPagination::respond($query, $request, ['created_at', 'starts_on', 'status'], PortalContractResource::class);
    }

    public function show(Request $request, string $id): PortalContractResource
    {
        $contract = Contract::query()
            ->with(['brand:id,name'])
            ->where('customer_id', PortalCustomer::id($request))
            ->whereIn('status', self::VISIBLE_STATUSES)
            ->findOrFail($id);

        return new PortalContractResource($contract);
    }
}
