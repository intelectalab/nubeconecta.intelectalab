<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Http\Controllers\Portal;

use App\Modules\Contracts\Http\Resources\PortalContractResource;
use App\Modules\Contracts\Models\Contract;
use App\Modules\Customers\Support\PortalCustomer;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

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

    /** Representación impresa en HTML del contrato (imprimible a PDF desde el navegador); `download=1` la entrega como adjunto. */
    public function document(Request $request, string $id): Response
    {
        $contract = Contract::query()
            ->with(['brand:id,name', 'customer:id,legal_name,trade_name,tax_id'])
            ->where('customer_id', PortalCustomer::id($request))
            ->whereIn('status', self::VISIBLE_STATUSES)
            ->findOrFail($id);

        $html = view('contracts::contract', ['c' => $contract])->render();

        return response($html, 200, [
            'Content-Type' => 'text/html; charset=utf-8',
            'Content-Disposition' => ($request->boolean('download') ? 'attachment' : 'inline').'; filename="contrato-'.$contract->number.'.html"',
            'X-Content-Type-Options' => 'nosniff',
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'",
        ]);
    }
}
