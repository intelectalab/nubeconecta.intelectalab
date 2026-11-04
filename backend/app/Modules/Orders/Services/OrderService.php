<?php

declare(strict_types=1);

namespace App\Modules\Orders\Services;

use App\Modules\Catalog\Models\Plan;
use App\Modules\Catalog\Services\PriceResolver;
use App\Modules\Customers\Models\Customer;
use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Orders\Events\OrderCancelled;
use App\Modules\Orders\Events\OrderCreated;
use App\Modules\Orders\Models\Order;
use App\Modules\Orders\Models\OrderItem;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Casos de uso de pedidos (M-ORD §4, franja MVP): registrar (draft) con precio
 * congelado del catálogo y total con IGV, aprobar y anular. Cada transición
 * valida estado, audita y emite evento (M-ORD §5).
 */
final class OrderService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
        private readonly PriceResolver $prices,
    ) {}

    public function rules(): array
    {
        $org = $this->organization->id();

        return [
            'customer_id' => ['required', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'currency' => ['sometimes', 'nullable', Rule::in(['PEN', 'USD'])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.plan_id' => ['required', 'uuid', Rule::exists('plans', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'items.*.quantity' => ['sometimes', 'numeric', 'gt:0', 'max:100000', 'decimal:0,3'],
            'items.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'items.*.config' => ['sometimes', 'array'],
        ];
    }

    public function updateRules(): array
    {
        $org = $this->organization->id();

        return [
            'version' => ['required', 'integer'],
            'customer_id' => ['sometimes', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'brand_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'currency' => ['sometimes', 'nullable', Rule::in(['PEN', 'USD'])],
            'notes' => ['sometimes', 'nullable', 'string', 'max:5000'],
            'items' => ['required', 'array', 'min:1', 'max:50'],
            'items.*.plan_id' => ['required', 'uuid', Rule::exists('plans', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'items.*.quantity' => ['sometimes', 'numeric', 'gt:0', 'max:100000', 'decimal:0,3'],
            'items.*.description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'items.*.config' => ['sometimes', 'array'],
        ];
    }

    /** @param array<string, mixed> $data */
    public function create(array $data, ?string $idempotencyKey): Order
    {
        $customer = Customer::query()->findOrFail($data['customer_id']);
        if ($customer->status !== 'active') {
            throw ProblemException::validation(['customer_id' => ['El cliente está inactivo.']]);
        }
        $currency = $data['currency'] ?? $customer->currency;
        $brand = $data['brand_id'] ?? $customer->origin_brand_id;
        $rate = $this->taxRate();
        $lines = $this->resolveLines($data['items'], $customer, $currency, $brand, $rate);
        $totals = OrderTotals::compute($lines, $rate);

        return DB::transaction(function () use ($customer, $currency, $brand, $data, $lines, $totals, $idempotencyKey): Order {
            $order = new Order;
            $order->forceFill([
                'number' => $this->nextNumber(), 'customer_id' => $customer->id, 'brand_id' => $brand, 'currency' => $currency,
                'notes' => $data['notes'] ?? null, 'total_minor' => $totals['total_minor'], 'status' => 'draft', 'channel' => 'sales',
                'requested_by' => Auth::id(), 'idempotency_key' => $idempotencyKey,
            ])->save();
            foreach ($lines as $line) {
                $item = new OrderItem;
                $item->forceFill([
                    'order_id' => $order->id, 'product_id' => $line['product_id'], 'plan_id' => $line['plan_id'],
                    'description' => $line['description'], 'quantity' => $line['quantity'], 'unit_price_minor' => $line['unit_price_minor'],
                    'currency' => $currency, 'config' => $line['config'],
                ])->save();
            }
            $this->audit->record('order.created', 'order', $order->id, null, $order->refresh()->attributesToArray() + ['totals' => $totals], [], $customer->id);
            OrderCreated::dispatch($order->organization_id, $order->id, $customer->id);

            return $order;
        });
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    public function preview(array $data): array
    {
        $customer = Customer::query()->findOrFail($data['customer_id']);
        if ($customer->status !== 'active') {
            throw ProblemException::validation(['customer_id' => ['El cliente está inactivo.']]);
        }
        $currency = $data['currency'] ?? $customer->currency;
        $brand = $data['brand_id'] ?? $customer->origin_brand_id;
        $rate = $this->taxRate();
        $lines = $this->resolveLines($data['items'], $customer, $currency, $brand, $rate);
        $totals = OrderTotals::compute($lines, $rate);

        return ['currency' => trim((string) $currency), 'tax_rate_percent' => $rate, 'items' => $lines] + $totals;
    }

    /** @param array<string, mixed> $data */
    public function updateDraft(Order $order, array $data): Order
    {
        return DB::transaction(function () use ($order, $data): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            VersionGuard::check($order, $data['version']);
            if ($order->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', "Solo se edita un pedido en borrador (estado actual: {$order->status}).", ['status' => $order->status]);
            }
            $before = $order->attributesToArray() + ['items' => $order->items()->get()->toArray()];
            $customer = Customer::query()->findOrFail($data['customer_id'] ?? $order->customer_id);
            if ($customer->status !== 'active') {
                throw ProblemException::validation(['customer_id' => ['El cliente está inactivo.']]);
            }
            $currency = array_key_exists('currency', $data) ? ($data['currency'] ?? $customer->currency) : $order->currency;
            $brand = array_key_exists('brand_id', $data) ? $data['brand_id'] : $order->brand_id;
            $rate = $this->taxRate();
            $lines = $this->resolveLines($data['items'], $customer, $currency, $brand, $rate);
            $totals = OrderTotals::compute($lines, $rate);
            $order->forceFill([
                'customer_id' => $customer->id, 'brand_id' => $brand, 'currency' => $currency,
                'notes' => array_key_exists('notes', $data) ? $data['notes'] : $order->notes,
                'total_minor' => $totals['total_minor'],
            ])->save();
            $order->items()->delete();
            foreach ($lines as $line) {
                $item = new OrderItem;
                $item->forceFill([
                    'order_id' => $order->id, 'product_id' => $line['product_id'], 'plan_id' => $line['plan_id'],
                    'description' => $line['description'], 'quantity' => $line['quantity'], 'unit_price_minor' => $line['unit_price_minor'],
                    'currency' => $currency, 'config' => $line['config'],
                ])->save();
            }
            $after = $order->refresh()->attributesToArray() + ['items' => $order->items()->get()->toArray(), 'totals' => $totals];
            $this->audit->record('order.updated', 'order', $order->id, $before, $after, [], $customer->id);

            return $order;
        });
    }

    /** @param list<array<string, mixed>> $items @return list<array<string, mixed>> */
    private function resolveLines(array $items, Customer $customer, string $currency, ?string $brand, string $rate): array
    {
        $export = $customer->tax_treatment === 'export';
        $lines = [];
        $errors = [];
        foreach (array_values($items) as $i => $item) {
            /** @var Plan|null $plan */
            $plan = Plan::query()->with('product')->find($item['plan_id']);
            $product = $plan?->product;
            if ($plan === null || $product === null || ! $plan->is_active || ! $product->is_active) {
                $errors["items.{$i}.plan_id"] = ['El plan o su producto no está activo.'];
                continue;
            }
            if ($product->brand_id !== null && $product->brand_id !== $brand) {
                $errors["items.{$i}.plan_id"] = ['El producto no se vende en la marca del pedido.'];
                continue;
            }
            $price = $this->prices->current($plan->id, $currency);
            if ($price === null) {
                $errors["items.{$i}.plan_id"] = ["El plan no tiene precio vigente en {$currency}."];
                continue;
            }
            $quantity = (string) ($item['quantity'] ?? '1');
            $taxed = ! ($export && $product->export_eligible);
            $tax = ['treatment' => $taxed ? 'taxed' : 'export', 'rate_percent' => $rate];
            $lines[] = [
                'product_id' => $product->id, 'plan_id' => $plan->id, 'quantity' => $quantity,
                'description' => $item['description'] ?? "{$product->name} · {$plan->name}",
                'unit_price_minor' => $price->price_minor,
                'config' => ($item['config'] ?? []) + ['cycle' => $plan->cycle, 'plan_price_id' => $price->id, 'tax' => $tax],
                'amount_minor' => OrderTotals::lineAmount($quantity, $price->price_minor), 'taxed' => $taxed,
            ];
            if ($price->setup_fee_minor > 0) {
                $lines[] = [
                    'product_id' => $product->id, 'plan_id' => $plan->id, 'quantity' => '1',
                    'description' => "Instalación · {$product->name}", 'unit_price_minor' => $price->setup_fee_minor,
                    'config' => ['kind' => 'setup_fee', 'plan_price_id' => $price->id, 'tax' => $tax],
                    'amount_minor' => $price->setup_fee_minor, 'taxed' => $taxed,
                ];
            }
        }
        if ($errors !== []) {
            throw ProblemException::validation($errors);
        }

        return $lines;
    }

    public function approve(Order $order, ?int $version): Order
    {
        return DB::transaction(function () use ($order, $version): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $this->assertVersion($order, $version);
            if ($order->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', "Solo se aprueba un pedido en borrador (estado actual: {$order->status}).", ['status' => $order->status]);
            }
            $items = $order->items()->get();
            if ($items->isEmpty()) {
                throw new ProblemException(409, 'invalid_transition', 'El pedido no tiene líneas.');
            }
            $before = $order->attributesToArray();
            $order->forceFill(['status' => 'approved', 'approved_by' => Auth::id(), 'approved_at' => now()])->save();
            $this->audit->record('order.approved', 'order', $order->id, $before, $order->refresh()->attributesToArray(), [], $order->customer_id);
            $requiresContract = DB::table('products')->whereIn('id', $items->pluck('product_id'))->where('requires_contract', true)->exists();
            OrderApproved::dispatch(
                $order->organization_id, $order->id, $order->customer_id, $order->brand_id, trim((string) $order->currency),
                $order->total_minor, $items->pluck('id')->map(fn ($id) => (string) $id)->all(), $requiresContract, Auth::id(),
            );

            return $order;
        });
    }

    public function cancel(Order $order, string $reason, ?int $version): Order
    {
        return DB::transaction(function () use ($order, $reason, $version): Order {
            $order = Order::query()->lockForUpdate()->findOrFail($order->id);
            $this->assertVersion($order, $version);
            if (! in_array($order->status, Order::CANCELLABLE, true)) {
                throw new ProblemException(409, 'invalid_transition', "No se puede anular un pedido en estado {$order->status}.", ['status' => $order->status]);
            }
            $before = $order->attributesToArray();
            $order->forceFill(['status' => 'cancelled'])->save();
            $this->audit->record('order.cancelled', 'order', $order->id, $before, $order->refresh()->attributesToArray(), ['reason' => $reason], $order->customer_id);
            OrderCancelled::dispatch($order->organization_id, $order->id, $order->customer_id);

            return $order;
        });
    }

    private function assertVersion(Order $order, ?int $version): void
    {
        if ($version !== null) {
            VersionGuard::check($order, $version);
        }
    }

    /** Tasa de IGV vigente hoy en `tax_rates` (RN-BIL-023: nunca fija en el código). */
    private function taxRate(): string
    {
        $today = now()->toDateString();
        $rate = DB::table('tax_rates')->where('organization_id', $this->organization->id())->where('code', 'igv')
            ->where('effective_from', '<=', $today)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $today))
            ->orderByDesc('effective_from')->value('rate_percent');
        if ($rate === null) {
            throw new ProblemException(409, 'tax_rate_missing', 'No hay tasa de IGV vigente en tax_rates.');
        }

        return (string) $rate;
    }

    private function nextNumber(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'order', 'prefix' => 'PED', 'padding' => 6, 'next_value' => 1]);

        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'order'])->code;
    }
}
