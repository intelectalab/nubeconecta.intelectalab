<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Resources;

use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Models\PaymentAllocation;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Pago en el panel (P-BIL-05/06). En el portal (PortalPaymentResource) sin
 * notas internas ni usuarios. `voided = true`: validado y luego anulado.
 * `allocated_minor` solo cuenta mientras el pago esté validado.
 *
 * @property Payment $resource
 */
class PaymentResource extends JsonResource
{
    protected bool $portal = false;

    public function toArray(Request $request): array
    {
        $p = $this->resource;
        $allocations = $p->relationLoaded('allocations') ? $p->allocations : $p->allocations()->with('invoice:id,series,number,currency,total_minor,balance_minor,status,due_date')->get();
        $data = [
            'id' => $p->id, 'customer_id' => $p->customer_id, 'status' => $p->status, 'voided' => $p->isVoided(),
            'payment_method' => $p->method === null ? null : ['id' => $p->method->id, 'code' => $p->method->code, 'name' => $p->method->name, 'kind' => $p->method->kind],
            'amount_minor' => $p->amount_minor, 'currency' => trim((string) $p->currency), 'allocated_minor' => (int) $allocations->sum('amount_minor'),
            'external_id' => $p->external_id, 'reported_via' => $p->reported_via, 'received_at' => $p->received_at?->toIso8601String(),
            'validated_at' => $p->validated_at?->toIso8601String(), 'rejection_reason' => $p->rejection_reason,
            'has_proof' => $p->proof_file_id !== null,
            'allocations' => $allocations->map(fn (PaymentAllocation $a) => [
                'invoice_id' => $a->invoice_id, 'invoice_number' => $a->invoice?->fullNumber(), 'amount_minor' => $a->amount_minor,
                'invoice_balance_minor' => $a->invoice?->balance_minor, 'invoice_status' => $a->invoice?->status,
            ])->values()->all(),
            'created_at' => $p->created_at?->toIso8601String(), 'updated_at' => $p->updated_at?->toIso8601String(), 'version' => $p->version,
        ];
        if (! $this->portal) {
            $data['customer'] = $p->customer === null ? null : ['id' => $p->customer->id, 'code' => $p->customer->code, 'legal_name' => $p->customer->legal_name, 'trade_name' => $p->customer->trade_name];
            $data['reported_by'] = $p->reported_by;
            $data['validated_by'] = $p->validated_by;
            $data['notes'] = $p->notes;
            $data['proof'] = $p->proof === null ? null : ['id' => $p->proof->id, 'original_name' => $p->proof->original_name, 'mime_type' => $p->proof->mime_type, 'size_bytes' => $p->proof->size_bytes, 'scan_status' => $p->proof->scan_status];
        }

        return $data;
    }
}
