<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Compromiso de pago con el cliente y el comprobante asociados (para la bandeja de cobranza). */
final class PaymentPromiseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'invoice_id' => $this->invoice_id,
            'customer_id' => $this->customer_id,
            'promised_date' => $this->promised_date?->toDateString(),
            'amount_minor' => $this->amount_minor === null ? null : (int) $this->amount_minor,
            'currency' => $this->currency,
            'status' => $this->status,
            'resolved_at' => $this->resolved_at?->toIso8601String(),
            'notes' => $this->notes,
            'invoice' => $this->whenLoaded('invoice', fn () => $this->invoice ? [
                'id' => $this->invoice->id,
                'number' => $this->invoice->fullNumber(),
                'status' => $this->invoice->status,
                'balance_minor' => (int) $this->invoice->balance_minor,
                'currency' => $this->invoice->currency,
            ] : null),
            'customer' => $this->whenLoaded('customer', fn () => $this->customer ? [
                'id' => $this->customer->id,
                'legal_name' => $this->customer->legal_name,
                'trade_name' => $this->customer->trade_name,
            ] : null),
            'version' => (int) $this->version,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
