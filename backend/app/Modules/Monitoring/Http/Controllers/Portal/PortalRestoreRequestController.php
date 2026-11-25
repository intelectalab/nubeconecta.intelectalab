<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers\Portal;

use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Support\PortalCustomer;
use App\Modules\Monitoring\Http\Resources\RestoreRequestResource;
use App\Modules\Monitoring\Models\RestoreRequest;
use App\Modules\Monitoring\Services\RestoreRequestService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/portal/restore-requests (portal, user.type:customer): el cliente pide
 * restaurar uno de SUS servicios a un punto en el tiempo y sigue el estado. Cada
 * solicitud abre un ticket de soporte. Scopeado al cliente de la sesión (sin IDOR).
 */
final class PortalRestoreRequestController
{
    public function __construct(private readonly RestoreRequestService $service) {}

    public function index(Request $request): JsonResponse
    {
        $query = RestoreRequest::query()->with(['service:id,label,code', 'ticket:id,number,status'])
            ->where('customer_id', PortalCustomer::id($request));

        return CursorPagination::respond($query, $request, ['created_at', 'status', 'code'], RestoreRequestResource::class, '-created_at');
    }

    public function show(Request $request, string $id): RestoreRequestResource
    {
        $req = RestoreRequest::query()->with(['service:id,label,code', 'ticket:id,number,status'])
            ->where('customer_id', PortalCustomer::id($request))->findOrFail($id);

        return new RestoreRequestResource($req);
    }

    public function store(Request $request): JsonResponse
    {
        $customerId = PortalCustomer::id($request);
        $data = $request->validate([
            // El servicio debe ser del cliente de la sesión.
            'service_id' => ['required', 'uuid', Rule::exists('services', 'id')->where('customer_id', $customerId)->whereNull('deleted_at')],
            'target_kind' => ['required', Rule::in(RestoreRequest::TARGET_KINDS)],
            'target_name' => ['required', 'string', 'max:255'],
            'restore_point_at' => ['required', 'date', 'before_or_equal:now'],
            'overwrite_confirmed' => ['accepted'],
        ]);

        $contactId = Contact::query()->where('customer_id', $customerId)
            ->where('user_id', $request->user()->getAuthIdentifier())->value('id');

        $req = $this->service->create($data, 'portal', (string) $request->user()->getAuthIdentifier(), $contactId);

        return (new RestoreRequestResource($req->load(['service:id,label,code', 'ticket:id,number,status'])))->response()->setStatusCode(201);
    }

    public function cancel(Request $request, string $id): RestoreRequestResource
    {
        $req = RestoreRequest::query()->where('customer_id', PortalCustomer::id($request))->findOrFail($id);
        $data = $request->validate(['version' => ['required', 'integer']]);
        \App\Shared\Concurrency\VersionGuard::check($req, $data['version']);

        return new RestoreRequestResource($this->service->cancel($req)->load(['service:id,label,code', 'ticket:id,number,status']));
    }
}
