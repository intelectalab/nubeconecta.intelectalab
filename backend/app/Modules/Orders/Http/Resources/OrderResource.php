<?php

declare(strict_types=1);

namespace App\Modules\Orders\Http\Resources;

use App\Modules\Orders\Models\Order;
use App\Modules\Orders\Models\OrderItem;
use App\Modules\Orders\Services\OrderTotals;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pedido en el panel: columnas de `orders` más `customer` (resumen), `items`
 * con `amount_minor`, y los derivados `subtotal_minor`, `tax_minor` y
 * `tax_rate_percent` (x-derived: total_minor - subtotal_minor).
 *
 * @property Order $resource
 */
final class OrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $order = $this->resource;
        $data = $order->makeHidden(['items', 'customer', 'idempotency_key'])->toArray();
        $data['currency'] = trim((string) $order->currency);
        $data['customer'] = $order->customer === null ? null : [
            'id' => $order->customer->id, 'code' => $order->customer->code,
            'legal_name' => $order->customer->legal_name, 'trade_name' => $order->customer->trade_name,
        ];

        $subtotal = 0;
        $rate = null;
        $data['items'] = $order->items->map(function (OrderItem $item) use (&$subtotal, &$rate): array {
            $amount = OrderTotals::lineAmount((string) $item->quantity, $item->unit_price_minor);
            $subtotal += $amount;
            $rate ??= $item->config['tax']['rate_percent'] ?? null;

            return [
                'id' => $item->id, 'product_id' => $item->product_id, 'plan_id' => $item->plan_id, 'service_id' => $item->service_id,
                'description' => $item->description, 'quantity' => (string) $item->quantity, 'unit_price_minor' => $item->unit_price_minor,
                'currency' => trim((string) $item->currency), 'amount_minor' => $amount, 'config' => $item->config,
            ];
        })->all();
        $data['subtotal_minor'] = $subtotal;
        $data['tax_minor'] = $order->total_minor - $subtotal;
        $data['tax_rate_percent'] = $rate;

        return $data;
    }
}
