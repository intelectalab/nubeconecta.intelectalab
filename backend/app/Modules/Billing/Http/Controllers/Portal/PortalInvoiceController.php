<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers\Portal;

use App\Modules\Billing\Http\Controllers\InvoiceController;
use App\Modules\Billing\Http\Resources\PortalInvoiceResource;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Customers\Support\PortalCustomer;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/** /api/v1/portal/invoices (portal.invoice.view): solo los comprobantes emitidos del cliente de la sesión; uno ajeno o en borrador responde 404. */
final class PortalInvoiceController
{
    public function index(Request $request): JsonResponse
    {
        $request->validate(InvoiceController::filterRules());
        $query = $this->own($request);
        InvoiceController::filter($query, $request, ['status', 'fiscal_status', 'type', 'currency']);

        return CursorPagination::respond($query, $request, ['created_at', 'issue_date', 'due_date', 'total_minor'], PortalInvoiceResource::class, '-issue_date');
    }

    public function show(Request $request, string $id): PortalInvoiceResource
    {
        return new PortalInvoiceResource($this->own($request)->with(['items', 'allocations.payment.method'])->findOrFail($id));
    }

    public function document(Request $request, string $id, InvoiceService $invoices): Response
    {
        return InvoiceController::render($invoices, $this->own($request)->findOrFail($id), $request->boolean('download'));
    }

    private function own(Request $request): Builder
    {
        return Invoice::query()->where('customer_id', PortalCustomer::id($request))->where('status', '<>', 'draft');
    }
}
