<?php

declare(strict_types=1);

namespace App\Modules\Orders\Http\Controllers;

use App\Modules\Orders\Http\Resources\OrderResource;
use App\Modules\Orders\Models\Order;
use App\Modules\Orders\Services\OrderService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * /api/v1/admin/orders (orders.order.*), P-ORD-01/02/03 en su franja MVP:
 * listado con filtros y cursor, alta (Idempotency-Key obligatoria), ficha,
 * aprobar y anular.
 */
final class OrderController
{
    public function __construct(private readonly OrderService $orders) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(Order::STATUSES)],
            'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.brand_id' => ['sometimes', 'uuid'],
            'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])],
            'filter.created_from' => ['sometimes', 'date_format:Y-m-d'],
            'filter.created_to' => ['sometimes', 'date_format:Y-m-d'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Order::query()->with(['items', 'customer:id,code,legal_name,trade_name']);
        foreach (['status', 'customer_id', 'brand_id', 'currency'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        if ($from = $request->input('filter.created_from')) {
            $query->where('created_at', '>=', $from);
        }
        if ($to = $request->input('filter.created_to')) {
            $query->where('created_at', '<', now()->parse($to)->addDay()->toDateString());
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('number', 'ilike', "%{$q}%")
                ->orWhereHas('customer', fn (Builder $c) => $c->where('legal_name', 'ilike', "%{$q}%")->orWhere('trade_name', 'ilike', "%{$q}%")->orWhere('code', 'ilike', "%{$q}%")));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'number', 'total_minor', 'status'], OrderResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $order = $this->orders->create($request->validate($this->orders->rules()), $request->header('Idempotency-Key'));

        return (new OrderResource($order->load(['items', 'customer'])))->response()->setStatusCode(201);
    }

    public function preview(Request $request): JsonResponse
    {
        $data = $request->validate($this->orders->rules());

        return response()->json(['data' => $this->orders->preview($data)]);
    }

    public function update(Request $request, string $id): OrderResource
    {
        $data = $request->validate($this->orders->updateRules());
        $order = $this->orders->updateDraft(Order::query()->findOrFail($id), $data);

        return new OrderResource($order->load(['items', 'customer']));
    }

    public function show(string $id): OrderResource
    {
        return new OrderResource(Order::query()->with(['items', 'customer'])->findOrFail($id));
    }

    public function approve(Request $request, string $id): OrderResource
    {
        $data = $request->validate(['version' => ['sometimes', 'integer']]);
        $order = Order::query()->findOrFail($id);

        // Fase 3 SaaS: aprobar un pedido provisiona un servicio por línea (salvo setup_fee
        // o líneas ya ligadas a un servicio). Si excediera el tope del plan, no se aprueba.
        $newServices = (int) \Illuminate\Support\Facades\DB::table('order_items')
            ->where('organization_id', $order->organization_id)->where('order_id', $order->id)
            ->whereNull('service_id')->whereRaw("coalesce(config->>'kind','') <> 'setup_fee'")
            ->count();
        if ($newServices > 0) {
            app(\App\Shared\Organization\PlanLimits::class)->assertCanAdd('services', $newServices, $order->organization_id);
        }

        $order = $this->orders->approve($order, isset($data['version']) ? (int) $data['version'] : null);

        return new OrderResource($order->load(['items', 'customer']));
    }

    public function cancel(Request $request, string $id): OrderResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500'], 'version' => ['sometimes', 'integer']]);
        $order = $this->orders->cancel(Order::query()->findOrFail($id), $data['reason'], isset($data['version']) ? (int) $data['version'] : null);

        return new OrderResource($order->load(['items', 'customer']));
    }
}
