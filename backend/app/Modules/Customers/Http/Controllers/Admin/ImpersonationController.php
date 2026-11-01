<?php

declare(strict_types=1);

namespace App\Modules\Customers\Http\Controllers\Admin;

use App\Modules\Customers\Models\Customer;
use App\Shared\Audit\AuditLogger;
use App\Shared\Authorization\ImpersonationState;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

/**
 * Vista "ver como cliente" (customers.customer.impersonate): activa sobre la
 * sesión del propio staff una vista de SOLO LECTURA del portal del cliente,
 * auditada al iniciar y al terminar. No crea sesiones ni toca credenciales.
 */
final class ImpersonationController
{
    public function __construct(private readonly AuditLogger $audit) {}

    /** POST /admin/customers/{id}/impersonation: inicia la vista y devuelve la URL del portal. */
    public function start(Request $request, string $id): JsonResponse
    {
        $customer = Customer::query()->findOrFail($id);
        $state = ImpersonationState::start($request->session(), $customer->id);
        $this->audit->record('customer.impersonation_started', 'customer', $customer->id, null, null, ['expires_at' => $state['expires_at']], $customer->id);

        return response()->json(['data' => [
            'customer_id' => $customer->id,
            'portal_url' => rtrim((string) config('hub.portal.url'), '/').'/',
            'expires_at' => $state['expires_at'],
        ]]);
    }

    /** DELETE /admin/customers/impersonation: termina la vista (sin permiso extra: salir siempre se puede). */
    public function stop(Request $request): Response
    {
        $state = ImpersonationState::stop($request->session());
        if ($state !== null) {
            $this->audit->record('customer.impersonation_ended', 'customer', $state['customer_id'], null, null, [], $state['customer_id']);
        }

        return response()->noContent();
    }
}
