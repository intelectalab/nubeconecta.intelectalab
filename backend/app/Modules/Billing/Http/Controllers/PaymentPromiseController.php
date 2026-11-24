<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Http\Resources\PaymentPromiseResource;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\PaymentPromise;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * /api/v1/admin/collections/promises (billing.payment_promise.*): compromisos de
 * pago para la bandeja de cobranza. Seguimiento open → kept/broken; no afecta la
 * mora ni la suspensión (D-04).
 */
final class PaymentPromiseController
{
    /** Estados de comprobante que admiten un compromiso (tienen saldo pendiente). */
    private const OWING = ['issued', 'partially_paid', 'overdue'];

    public function __construct(private readonly AuditLogger $audit) {}

    public function index(Request $request): JsonResponse
    {
        $query = PaymentPromise::query()->with(['invoice:id,series,number,status,balance_minor,currency', 'customer:id,legal_name,trade_name']);

        if (is_string($status = $request->input('filter.status')) && $status !== '') {
            $query->where('status', $status);
        }
        foreach (['invoice_id', 'customer_id'] as $col) {
            if (is_string($v = $request->input("filter.{$col}")) && $v !== '') {
                $query->where($col, $v);
            }
        }
        if (is_string($q = $request->input('q')) && trim($q) !== '') {
            $term = '%'.mb_strtolower(trim($q)).'%';
            $query->where(function ($w) use ($term): void {
                $w->whereHas('customer', fn ($c) => $c->whereRaw('lower(legal_name) like ?', [$term])->orWhereRaw('lower(coalesce(trade_name, \'\')) like ?', [$term]))
                    ->orWhereHas('invoice', fn ($i) => $i->whereRaw("lower(coalesce(series, '') || '-' || lpad(number::text, 8, '0')) like ?", [$term]));
            });
        }

        return CursorPagination::respond($query, $request, ['promised_date', 'created_at', 'status'], PaymentPromiseResource::class, '-created_at');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'invoice_id' => ['required', 'uuid'],
            'promised_date' => ['required', 'date', 'after_or_equal:today', 'before_or_equal:'.now()->addDays(30)->toDateString()],
            'amount_minor' => ['nullable', 'integer', 'min:1'],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);

        $invoice = Invoice::query()->findOrFail($data['invoice_id']);
        if (! in_array($invoice->status, self::OWING, true) || (int) $invoice->balance_minor <= 0) {
            throw ValidationException::withMessages(['invoice_id' => ['El comprobante no tiene saldo pendiente.']]);
        }
        if (PaymentPromise::query()->where('invoice_id', $invoice->id)->where('status', 'open')->exists()) {
            throw ValidationException::withMessages(['invoice_id' => ['El comprobante ya tiene un compromiso vigente.']]);
        }
        $amount = $data['amount_minor'] ?? (int) $invoice->balance_minor;
        if ($amount > (int) $invoice->balance_minor) {
            throw ValidationException::withMessages(['amount_minor' => ['El monto no puede superar el saldo del comprobante.']]);
        }

        $promise = DB::transaction(function () use ($invoice, $data, $amount): PaymentPromise {
            $promise = new PaymentPromise;
            $promise->forceFill([
                'invoice_id' => $invoice->id,
                'customer_id' => $invoice->customer_id,
                'promised_date' => $data['promised_date'],
                'amount_minor' => $amount,
                'currency' => $invoice->currency,
                'status' => 'open',
                'notes' => $data['notes'] ?? null,
            ])->save();
            $this->audit->record('payment_promise.created', 'payment_promise', $promise->id, null, $promise->attributesToArray(), ['invoice_id' => $invoice->id], $invoice->customer_id);

            return $promise;
        });

        return (new PaymentPromiseResource($promise->load(['invoice:id,series,number,status,balance_minor,currency', 'customer:id,legal_name,trade_name'])))->response()->setStatusCode(201);
    }

    /** Cierra un compromiso: cumplido (kept) o incumplido (broken). */
    public function resolve(Request $request, string $id): PaymentPromiseResource
    {
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'status' => ['required', Rule::in(['kept', 'broken'])],
            'notes' => ['nullable', 'string', 'max:1000'],
        ]);
        $promise = PaymentPromise::query()->findOrFail($id);
        if ($promise->status !== 'open') {
            throw ProblemException::badRequest('El compromiso ya fue cerrado.');
        }

        DB::transaction(function () use ($promise, $data): void {
            VersionGuard::check($promise, $data['version']);
            $before = $promise->attributesToArray();
            $promise->forceFill([
                'status' => $data['status'],
                'resolved_at' => now(),
                'notes' => $data['notes'] ?? $promise->notes,
            ])->save();
            $this->audit->record('payment_promise.resolved', 'payment_promise', $promise->id, $before, $promise->refresh()->attributesToArray(), ['status' => $data['status']], $promise->customer_id);
        });

        return new PaymentPromiseResource($promise->load(['invoice:id,series,number,status,balance_minor,currency', 'customer:id,legal_name,trade_name']));
    }
}
