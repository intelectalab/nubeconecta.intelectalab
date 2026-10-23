<?php

declare(strict_types=1);

namespace App\Modules\Services\Http\Controllers;

use App\Modules\Services\Http\Resources\ServiceResource;
use App\Modules\Services\Models\Service;
use App\Modules\Services\Services\ServiceLifecycle;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/services (services.service.*), P-SRV-01/02 en su franja MVP:
 * listado con filtros y cursor, ficha con suscripción e historial, y las
 * transiciones manuales de la máquina 1 (docs/03).
 */
final class ServiceController
{
    public function __construct(private readonly ServiceLifecycle $lifecycle) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(Service::STATUSES)],
            'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.brand_id' => ['sometimes', 'uuid'],
            'filter.product_id' => ['sometimes', 'uuid'],
            'filter.order_id' => ['sometimes', 'uuid'],
            'filter.due_from' => ['sometimes', 'date_format:Y-m-d'],
            'filter.due_to' => ['sometimes', 'date_format:Y-m-d'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Service::query()->with(['subscription', 'product', 'plan', 'customer:id,code,legal_name,trade_name']);
        self::filter($query, $request, ['status', 'customer_id', 'brand_id', 'product_id']);
        if (is_string($orderId = $request->input('filter.order_id')) && $orderId !== '') {
            $query->where('custom->order->order_id', $orderId); // servicios creados al aprobar ese pedido
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('code', 'ilike', "%{$q}%")->orWhere('label', 'ilike', "%{$q}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', "%{$q}%")->orWhere('trade_name', 'ilike', "%{$q}%")->orWhere('code', 'ilike', "%{$q}%")));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'code', 'commercial_due_date', 'status'], ServiceResource::class);
    }

    /** Filtros comunes del panel y del portal. @param list<string> $columns */
    public static function filter(Builder $query, Request $request, array $columns): void
    {
        foreach ($columns as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        if ($from = $request->input('filter.due_from')) {
            $query->where('commercial_due_date', '>=', $from);
        }
        if ($to = $request->input('filter.due_to')) {
            $query->where('commercial_due_date', '<=', $to);
        }
    }

    public function show(string $id): ServiceResource
    {
        return $this->resource(Service::query()->findOrFail($id));
    }

    public function activate(Request $request, string $id): ServiceResource
    {
        return $this->move($request, $id, 'activate', false);
    }

    public function suspend(Request $request, string $id): ServiceResource
    {
        return $this->move($request, $id, 'suspend', true);
    }

    public function reactivate(Request $request, string $id): ServiceResource
    {
        return $this->move($request, $id, 'reactivate', true);
    }

    public function cancel(Request $request, string $id): ServiceResource
    {
        return $this->move($request, $id, 'cancel', true);
    }

    private function move(Request $request, string $id, string $action, bool $reasonRequired): ServiceResource
    {
        $data = $request->validate([
            'reason' => [$reasonRequired ? 'required' : 'sometimes', 'nullable', 'string', 'min:3', 'max:500'],
            'version' => ['sometimes', 'integer'],
        ]);
        $service = $this->lifecycle->transition(Service::query()->findOrFail($id), $action, $data['reason'] ?? null, isset($data['version']) ? (int) $data['version'] : null);

        return $this->resource($service);
    }

    private function resource(Service $service): ServiceResource
    {
        return (new ServiceResource($service->load(['subscription', 'product', 'plan', 'customer'])))->withDetail();
    }
}
