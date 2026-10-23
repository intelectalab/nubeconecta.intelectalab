<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Resources;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\InvoiceItem;
use App\Modules\Billing\Models\PaymentAllocation;
use App\Modules\Billing\Services\CardPaymentService;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Comprobante en el panel (en el portal, PortalInvoiceResource oculta notas,
 * origen interno y auditoría). `number` es "F001-00000123"; `balance_minor`
 * es el saldo pendiente; `einvoice.simulated = true` marca el CDR ficticio.
 *
 * @property Invoice $resource
 */
class InvoiceResource extends JsonResource
{
    protected bool $portal = false;

    public function toArray(Request $request): array
    {
        $i = $this->resource;
        $einvoice = $i->custom['einvoice'] ?? null;
        $data = [
            'id' => $i->id, 'type' => $i->type, 'status' => $i->status, 'fiscal_status' => $i->fiscal_status, 'tax_treatment' => $i->tax_treatment,
            'series' => $i->series, 'number' => $i->fullNumber(), 'correlative' => $i->number,
            'customer_id' => $i->customer_id, 'brand_id' => $i->brand_id, 'legal_entity_id' => $i->legal_entity_id,
            'currency' => trim((string) $i->currency), 'issue_date' => $i->issue_date?->toDateString(), 'due_date' => $i->due_date?->toDateString(),
            'subtotal_minor' => $i->subtotal_minor, 'discount_minor' => $i->discount_minor, 'tax_minor' => $i->tax_minor,
            'total_minor' => $i->total_minor, 'balance_minor' => $i->balance_minor, 'tax_rate_percent' => $i->custom['tax_rate_percent'] ?? null,
            'einvoice' => $einvoice === null ? null : [
                'provider' => $einvoice['provider'] ?? null, 'reference' => $einvoice['reference'] ?? null, 'code' => $einvoice['code'] ?? null,
                'message' => $einvoice['message'] ?? null, 'simulated' => (bool) ($einvoice['simulated'] ?? false), 'cdr' => $einvoice['cdr'] ?? null,
            ],
            'issued_at' => $i->issued_at?->toIso8601String(), 'voided_at' => $i->voided_at?->toIso8601String(),
            'items' => $i->relationLoaded('items') ? $i->items->map(fn (InvoiceItem $l) => [
                'id' => $l->id, 'kind' => $l->kind, 'service_id' => $l->service_id, 'product_id' => $l->product_id, 'description' => $l->description,
                'period_start' => $l->period_start?->toDateString(), 'period_end' => $l->period_end?->toDateString(), 'quantity' => (string) $l->quantity,
                'unit_price_minor' => $l->unit_price_minor, 'subtotal_minor' => $l->subtotal_minor, 'tax_minor' => $l->tax_minor, 'total_minor' => $l->total_minor,
            ])->all() : null,
            'payments' => $i->relationLoaded('allocations') ? $i->allocations->map(fn (PaymentAllocation $a) => [
                'payment_id' => $a->payment_id, 'amount_minor' => $a->amount_minor, 'status' => $a->payment?->status, 'voided' => (bool) $a->payment?->isVoided(),
                'method' => $a->payment?->method?->name, 'external_id' => $a->payment?->external_id, 'received_at' => $a->payment?->received_at?->toIso8601String(),
            ])->values()->all() : null,
            'paid_at' => $i->paid_at?->toIso8601String(),
            'created_at' => $i->created_at?->toIso8601String(), 'updated_at' => $i->updated_at?->toIso8601String(), 'version' => $i->version,
        ];
        if ($this->portal) {
            $data['card_payment'] = ['available' => app(CardPaymentService::class)->availableFor($i), 'provider' => 'mercadopago'];
        }
        if (! $this->portal) {
            $data['customer'] = $i->customer === null ? null : ['id' => $i->customer->id, 'code' => $i->customer->code, 'legal_name' => $i->customer->legal_name, 'trade_name' => $i->customer->trade_name];
            $data['origin'] = ['type' => $i->custom['origin'] ?? null, 'order_id' => $i->custom['order_id'] ?? null, 'subscription_id' => $i->custom['subscription_id'] ?? null];
            $data['void_reason'] = $i->void_reason;
            $data['notes'] = $i->notes;
        }

        return $data;
    }
}
