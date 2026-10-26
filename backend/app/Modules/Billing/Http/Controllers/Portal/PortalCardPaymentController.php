<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers\Portal;

use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\PaymentCheckout;
use App\Modules\Billing\Services\CardPaymentService;
use App\Modules\Customers\Support\PortalCustomer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Portal: pago con tarjeta (Mercado Pago Checkout Pro). Crear el intento
 * devuelve la URL del formulario alojado; al volver, el portal envía el
 * payment_id y el backend lo consulta a la pasarela (nunca confía en la URL).
 * Solo intentos y comprobantes propios: lo ajeno → 404.
 */
final class PortalCardPaymentController
{
    public function store(Request $request, string $id, CardPaymentService $cards): JsonResponse
    {
        $customerId = PortalCustomer::id($request);
        $invoice = Invoice::query()->where('customer_id', $customerId)->where('status', '<>', 'draft')->findOrFail($id);
        $result = $cards->start($invoice, $customerId, (string) $request->headers->get('Idempotency-Key'), $request->user()?->email);

        return response()->json(['data' => self::resource($result['checkout']) + ['redirect_url' => $result['redirect_url']]], 201);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        return response()->json(['data' => self::resource($this->own($request, $id))]);
    }

    /** Retorno desde Mercado Pago: payment_id o collection_id (si no hay, solo devuelve el estado actual). */
    public function confirm(Request $request, string $id, CardPaymentService $cards): JsonResponse
    {
        $data = $request->validate([
            'payment_id' => ['sometimes', 'nullable', 'string', 'regex:/^\d{1,20}$/'],
            'collection_id' => ['sometimes', 'nullable', 'string', 'regex:/^\d{1,20}$/'],
        ]);
        $checkout = $this->own($request, $id);
        $paymentId = $data['payment_id'] ?? $data['collection_id'] ?? null;
        if ($paymentId !== null && $checkout->status !== 'approved' && $checkout->external_session_id !== null) {
            $checkout = $cards->confirm($paymentId, $checkout->customer_id, 'return', $checkout->id) ?? $checkout;
        }

        return response()->json(['data' => self::resource($checkout->refresh())]);
    }

    private function own(Request $request, string $id): PaymentCheckout
    {
        return PaymentCheckout::query()->where('customer_id', PortalCustomer::id($request))->findOrFail($id);
    }

    /** @return array<string, mixed> */
    public static function resource(PaymentCheckout $c): array
    {
        return [
            'id' => $c->id, 'invoice_id' => $c->invoice_ids[0] ?? null, 'status' => $c->outcome(), 'provider' => 'mercadopago',
            'amount_minor' => $c->amount_minor, 'surcharge_minor' => $c->surcharge_minor, 'currency' => trim((string) $c->currency),
            'payment_id' => $c->payment_id, 'message' => $c->status === 'declined' ? CardPaymentService::declineMessage($c->decline_reason) : null,
            'expires_at' => $c->expires_at?->toIso8601String(), 'completed_at' => $c->completed_at?->toIso8601String(),
        ];
    }
}
