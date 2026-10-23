<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Http\Resources\PaymentResource;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Models\PaymentMethod;
use App\Modules\Billing\Services\PaymentService;
use App\Modules\Billing\Services\ProofStorage;
use App\Shared\Contracts\AccessControl;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * /api/v1/admin/payments (billing.payment.*), P-BIL-05..08 en su franja MVP:
 * listado, ficha, registrar (JSON o multipart con constancia), validar,
 * rechazar, anular y descargar la constancia. Mutaciones con Idempotency-Key.
 */
final class PaymentController
{
    public function __construct(private readonly PaymentService $payments) {}

    public function methods(): JsonResponse
    {
        $methods = PaymentMethod::query()->where('is_active', true)->orderBy('name')->get();

        return response()->json(['data' => $methods->map(fn (PaymentMethod $m) => self::method($m))->values()]);
    }

    /** @return array<string, mixed> */
    public static function method(PaymentMethod $m): array
    {
        return [
            'id' => $m->id, 'code' => $m->code, 'name' => $m->name, 'kind' => $m->kind, 'requires_proof' => $m->requires_proof,
            'available_in_portal' => $m->available_in_portal, 'instructions' => (object) ($m->instructions ?? []),
        ];
    }

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(Payment::STATUSES)],
            'filter.reported_via' => ['sometimes', Rule::in(Payment::VIA)],
            'filter.currency' => ['sometimes', Rule::in(['PEN', 'USD'])],
            'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.payment_method_id' => ['sometimes', 'uuid'],
            'filter.invoice_id' => ['sometimes', 'uuid'],
        ]);
        $query = Payment::query()->with(['customer:id,code,legal_name,trade_name', 'method', 'proof', 'allocations.invoice']);
        foreach (['status', 'reported_via', 'currency', 'customer_id', 'payment_method_id'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        if (is_string($invoice = $request->input('filter.invoice_id')) && $invoice !== '') {
            $query->whereHas('allocations', fn ($q) => $q->where('invoice_id', $invoice));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'received_at', 'amount_minor'], PaymentResource::class);
    }

    public function show(string $id): PaymentResource
    {
        return new PaymentResource(Payment::query()->with(['customer', 'method', 'proof', 'allocations.invoice'])->findOrFail($id));
    }

    public function store(Request $request, AccessControl $access): JsonResponse
    {
        $data = $request->validate(self::rules() + [
            'customer_id' => ['required', 'uuid'],
            'currency' => ['required', Rule::in(['PEN', 'USD'])],
            'validate' => ['sometimes', 'boolean'],
            'proof' => ProofStorage::rules(false),
        ]);
        $canValidate = $access->allows($request->user(), 'billing.payment.validate');
        $validate = $request->boolean('validate');
        if ($validate && ! $canValidate) {
            throw ProblemException::forbidden('Guardar y validar exige billing.payment.validate; guárdelo como reportado.');
        }
        $payment = $this->payments->record(self::normalize($data), $request->file('proof'), $canValidate ? 'finance' : 'sales', $validate);

        return $this->show($payment->id)->response()->setStatusCode(201);
    }

    public function validatePayment(Request $request, string $id): PaymentResource
    {
        $data = $request->validate(self::allocationRules() + ['version' => ['sometimes', 'integer']]);
        $allocations = array_key_exists('allocations', $data) ? self::normalize($data)['allocations'] : null;
        $this->payments->validate(Payment::query()->findOrFail($id), $allocations, isset($data['version']) ? (int) $data['version'] : null);

        return $this->show($id);
    }

    public function reject(Request $request, string $id): PaymentResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500'], 'version' => ['sometimes', 'integer']]);
        $this->payments->reject(Payment::query()->findOrFail($id), $data['reason'], isset($data['version']) ? (int) $data['version'] : null);

        return $this->show($id);
    }

    public function void(Request $request, string $id): PaymentResource
    {
        $data = $request->validate(['reason' => ['required', 'string', 'min:3', 'max:500'], 'version' => ['sometimes', 'integer']]);
        $this->payments->void(Payment::query()->findOrFail($id), $data['reason'], isset($data['version']) ? (int) $data['version'] : null);

        return $this->show($id);
    }

    public function proof(string $id, ProofStorage $proofs): StreamedResponse
    {
        $payment = Payment::query()->with('proof')->findOrFail($id);

        return $payment->proof === null ? throw ProblemException::notFound() : $proofs->download($payment->proof);
    }

    /** @return array<string, list<mixed>> */
    public static function rules(): array
    {
        return [
            'payment_method_id' => ['required', 'uuid'],
            'amount_minor' => ['required', 'integer', 'min:1', 'max:100000000000'],
            'received_at' => ['sometimes', 'nullable', 'date_format:Y-m-d', 'before_or_equal:today'],
            'external_id' => ['sometimes', 'nullable', 'string', 'max:120'],
            'notes' => ['sometimes', 'nullable', 'string', 'max:1000'],
        ] + self::allocationRules();
    }

    /** @return array<string, list<mixed>> */
    public static function allocationRules(): array
    {
        return [
            'allocations' => ['sometimes', 'array', 'max:50'],
            'allocations.*.invoice_id' => ['required', 'uuid'],
            'allocations.*.amount_minor' => ['required', 'integer', 'min:1'],
        ];
    }

    /**
     * @param  array<string, mixed>  $data
     * @return array<string, mixed>
     */
    public static function normalize(array $data): array
    {
        $data['allocations'] = array_values(array_map(fn ($a) => ['invoice_id' => (string) $a['invoice_id'], 'amount_minor' => (int) $a['amount_minor']], (array) ($data['allocations'] ?? [])));
        if (isset($data['amount_minor'])) {
            $data['amount_minor'] = (int) $data['amount_minor'];
        }
        unset($data['proof'], $data['validate']);

        return $data;
    }
}
