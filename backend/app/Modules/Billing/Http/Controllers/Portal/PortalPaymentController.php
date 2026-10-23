<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers\Portal;

use App\Modules\Billing\Http\Controllers\PaymentController;
use App\Modules\Billing\Http\Resources\PortalPaymentResource;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Models\PaymentMethod;
use App\Modules\Billing\Services\PaymentService;
use App\Modules\Billing\Services\ProofStorage;
use App\Modules\Customers\Support\PortalCustomer;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Portal (P-PRT-08/09): medios para reportar, constancia de pago (voucher)
 * de un comprobante propio, historial de pagos y vouchers y descarga de la
 * constancia propia. El cliente sale siempre de la sesión: lo ajeno → 404.
 */
final class PortalPaymentController
{
    public function methods(): JsonResponse
    {
        $methods = PaymentMethod::query()->where('is_active', true)->where('available_in_portal', true)->where('kind', '<>', 'card_gateway')->orderBy('name')->get();

        return response()->json(['data' => $methods->map(fn (PaymentMethod $m) => PaymentController::method($m))->values()]);
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.status' => ['sometimes', Rule::in(Payment::STATUSES)], 'filter.invoice_id' => ['sometimes', 'uuid']]);
        $query = $this->own($request)->with(['method', 'allocations.invoice']);
        if (is_string($status = $request->input('filter.status')) && $status !== '') {
            $query->where('status', $status);
        }
        if (is_string($invoice = $request->input('filter.invoice_id')) && $invoice !== '') {
            $query->whereHas('allocations', fn ($q) => $q->where('invoice_id', $invoice));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'received_at', 'amount_minor'], PortalPaymentResource::class);
    }

    public function show(Request $request, string $id): PortalPaymentResource
    {
        return new PortalPaymentResource($this->own($request)->with(['method', 'allocations.invoice'])->findOrFail($id));
    }

    public function proof(Request $request, string $id, ProofStorage $proofs): StreamedResponse
    {
        $payment = $this->own($request)->with('proof')->findOrFail($id);

        return $payment->proof === null ? throw ProblemException::notFound() : $proofs->download($payment->proof);
    }

    /** Sube la constancia: pago `reported` por el importe indicado, propuesto contra ese comprobante (RN-BIL-050). */
    public function submitVoucher(Request $request, string $id, PaymentService $payments): JsonResponse
    {
        $customerId = PortalCustomer::id($request);
        $invoice = Invoice::query()->where('customer_id', $customerId)->where('status', '<>', 'draft')->findOrFail($id);
        $data = $request->validate([
            'payment_method_id' => ['required', 'uuid'],
            'amount_minor' => ['required', 'integer', 'min:1'],
            'received_at' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'external_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:500'],
            'file' => ProofStorage::rules(true),
        ]);
        if (! in_array($invoice->status, PaymentService::OPEN_STATUSES, true) || $invoice->balance_minor === 0) {
            throw new ProblemException(409, 'invoice_not_payable', 'El comprobante no tiene saldo pendiente.');
        }
        $payment = $payments->record([
            'customer_id' => $customerId, 'payment_method_id' => $data['payment_method_id'], 'amount_minor' => (int) $data['amount_minor'],
            'currency' => trim((string) $invoice->currency), 'received_at' => $data['received_at'] ?? null, 'external_id' => $data['external_id'] ?? null,
            'notes' => $data['notes'] ?? null,
            'allocations' => [['invoice_id' => $invoice->id, 'amount_minor' => min((int) $data['amount_minor'], $invoice->balance_minor)]],
        ], $request->file('file'), 'portal', false);

        return $this->show($request, $payment->id)->response()->setStatusCode(201);
    }

    private function own(Request $request): Builder
    {
        return Payment::query()->where('customer_id', PortalCustomer::id($request));
    }
}
