<?php

declare(strict_types=1);

namespace App\Modules\Services\Http\Resources;

use App\Modules\Services\Models\Service;
use App\Modules\Services\Models\Subscription;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\DB;

/**
 * Servicio en el panel (o en el portal con `$portal = true`: sin notas
 * internas, `custom` ni datos de proveedor). `price` es el precio congelado:
 * el de la suscripción si existe, si no el de la línea del pedido.
 *
 * @property Service $resource
 */
class ServiceResource extends JsonResource
{
    protected bool $portal = false;

    private bool $detail = false;

    /** Ficha: agrega el historial de estados. */
    public function withDetail(): static
    {
        $this->detail = true;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $s = $this->resource;
        $order = $s->custom['order'] ?? [];
        $sub = $s->relationLoaded('subscription') ? $s->subscription : $s->subscription()->first();
        $data = [
            'id' => $s->id, 'code' => $s->code, 'label' => $s->label, 'status' => $s->status,
            'customer_id' => $s->customer_id, 'brand_id' => $s->brand_id, 'product_id' => $s->product_id, 'plan_id' => $s->plan_id,
            'product' => $s->product === null ? null : ['id' => $s->product->id, 'code' => $s->product->code, 'name' => $s->product->name],
            'plan' => $s->plan === null ? null : ['id' => $s->plan->id, 'code' => $s->plan->code, 'name' => $s->plan->name, 'cycle' => $s->plan->cycle],
            'cycle' => $sub?->cycle ?? ($order['cycle'] ?? null),
            'price' => [
                'unit_price_minor' => $sub?->price_minor ?? ($order['unit_price_minor'] ?? null),
                'quantity' => (string) ($sub?->quantity ?? ($order['quantity'] ?? '1')),
                'currency' => trim((string) ($sub?->currency ?? ($order['currency'] ?? ''))) ?: null,
            ],
            'starts_on' => $sub?->starts_on?->toDateString() ?? ($order['starts_on'] ?? null),
            'commercial_due_date' => $s->commercial_due_date?->toDateString(),
            'auto_renew' => $s->auto_renew,
            'activated_at' => $s->activated_at?->toIso8601String(), 'suspended_at' => $s->suspended_at?->toIso8601String(),
            'cancelled_at' => $s->cancelled_at?->toIso8601String(),
            'subscription' => $sub === null ? null : $this->subscription($sub),
            'created_at' => $s->created_at?->toIso8601String(), 'updated_at' => $s->updated_at?->toIso8601String(), 'version' => $s->version,
        ];
        if (! $this->portal) {
            $data['order_id'] = $order['order_id'] ?? null;
            $data['order_item_id'] = $order['order_item_id'] ?? null;
            $data['customer'] = $s->customer === null ? null : ['id' => $s->customer->id, 'code' => $s->customer->code, 'legal_name' => $s->customer->legal_name, 'trade_name' => $s->customer->trade_name];
            $data['notes_internal'] = $s->notes_internal;
        }
        if ($this->detail) {
            $data['history'] = DB::table('service_status_history')->where('service_id', $s->id)->orderByDesc('occurred_at')->orderByDesc('id')->limit(50)
                ->get($this->portal ? ['from_status', 'to_status', 'occurred_at'] : ['from_status', 'to_status', 'reason', 'trigger_source', 'occurred_at'])
                ->map(fn ($h) => (array) $h)->all();
        }

        return $data;
    }

    /** @return array<string, mixed> */
    private function subscription(Subscription $sub): array
    {
        return [
            'id' => $sub->id, 'status' => $sub->status, 'cycle' => $sub->cycle, 'quantity' => (string) $sub->quantity,
            'price_minor' => $sub->price_minor, 'currency' => trim((string) $sub->currency),
            'starts_on' => $sub->starts_on?->toDateString(), 'next_invoice_date' => $sub->next_invoice_date?->toDateString(),
        ];
    }
}
