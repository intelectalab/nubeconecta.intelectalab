<?php

declare(strict_types=1);

namespace App\Modules\Services\Http\Controllers\Portal;

use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Services\Http\Controllers\ServiceController;
use App\Modules\Services\Http\Resources\PortalServiceResource;
use App\Modules\Services\Models\Service;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/** /api/v1/portal/services (portal.service.view): solo los servicios del cliente de la sesión; uno ajeno responde 404. */
final class PortalServiceController
{
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(\App\Modules\Services\Models\Service::STATUSES)],
            'filter.due_from' => ['sometimes', 'date_format:Y-m-d'],
            'filter.due_to' => ['sometimes', 'date_format:Y-m-d'],
        ]);
        $query = Service::query()->with(['subscription', 'product', 'plan'])->where('customer_id', PortalCustomer::id($request));
        ServiceController::filter($query, $request, ['status']);

        return CursorPagination::respond($query, $request, ['created_at', 'code', 'commercial_due_date', 'status'], PortalServiceResource::class);
    }

    public function show(Request $request, string $id): PortalServiceResource
    {
        $service = Service::query()->with(['subscription', 'product', 'plan'])->where('customer_id', PortalCustomer::id($request))->findOrFail($id);

        return (new PortalServiceResource($service))->withDetail();
    }
}
