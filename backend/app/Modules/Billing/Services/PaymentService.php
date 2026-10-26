<?php

declare(strict_types=1);

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Events\InvoicePaid;
use App\Modules\Billing\Events\PaymentRecorded;
use App\Modules\Billing\Events\PaymentRejected;
use App\Modules\Billing\Events\PaymentReported;
use App\Modules\Billing\Events\PaymentValidated;
use App\Modules\Billing\Events\PaymentVoided;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\Payment;
use App\Modules\Billing\Models\PaymentAllocation;
use App\Modules\Billing\Models\PaymentMethod;
use App\Modules\Billing\Models\StoredFile;
use App\Modules\Customers\Models\Customer;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use Carbon\CarbonImmutable;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Throwable;

/**
 * Pagos (M-BIL §4 flujos 4 y 6, docs/03 §3 y §5), franja MVP: registro manual
 * o constancia del portal (`reported`), validación por finanzas que aplica el
 * pago a uno o varios comprobantes (parcial o total), rechazo con motivo y
 * anulación que revierte las aplicaciones. Importes enteros en céntimos; el
 * saldo de cada comprobante = total − aplicaciones de pagos `validated`.
 */
final class PaymentService
{
    public const OPEN_STATUSES = ['issued', 'partially_paid', 'overdue'];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly ProofStorage $proofs,
    ) {}

    /**
     * @param  array{customer_id: string, payment_method_id: string, amount_minor: int, currency: string, received_at?: ?string, external_id?: ?string, notes?: ?string, allocations?: list<array{invoice_id: string, amount_minor: int}>}  $data
     * @param  'portal'|'sales'|'finance'  $via
     */
    public function record(array $data, ?UploadedFile $proof, string $via, bool $validate): Payment
    {
        $stored = null;
        try {
            $payment = DB::transaction(function () use ($data, $proof, $via, $validate, &$stored): Payment {
                $customer = Customer::query()->findOrFail($data['customer_id']);
                $method = PaymentMethod::query()->find($data['payment_method_id']);
                if ($method === null || ! $method->is_active || $method->kind === 'card_gateway' || ($via === 'portal' && ! $method->acceptsVoucher())) {
                    throw ProblemException::validation(['payment_method_id' => ['El medio de pago no está disponible para registro manual.']]);
                }
                $external = isset($data['external_id']) && trim((string) $data['external_id']) !== '' ? trim((string) $data['external_id']) : null;
                if ($external !== null && ($dup = Payment::query()->where('payment_method_id', $method->id)->where('external_id', $external)->first(['customer_id'])) !== null) {
                    if ($via === 'portal' && $dup->customer_id !== $customer->id) {
                        // Desde el portal no se confirma la existencia de referencias de otros clientes.
                        throw ProblemException::validation(['external_id' => ['No se pudo registrar esa referencia; verifíquela o deje el campo vacío.']]);
                    }
                    throw new ProblemException(409, 'duplicate_reference', 'Ya existe un pago con esa referencia para el mismo medio de pago.', ['external_id' => $external]);
                }
                if ($proof !== null) {
                    $stored = $this->proofs->store($proof);
                }
                $payment = new Payment;
                $payment->forceFill([
                    'customer_id' => $customer->id, 'payment_method_id' => $method->id, 'status' => 'reported',
                    'amount_minor' => (int) $data['amount_minor'], 'currency' => $data['currency'], 'external_id' => $external,
                    'bank_account_id' => $method->bank_account_id, 'proof_file_id' => $stored?->id, 'reported_via' => $via, 'reported_by' => Auth::id(),
                    'received_at' => isset($data['received_at']) ? CarbonImmutable::parse($data['received_at'])->startOfDay() : now(),
                    'notes' => $data['notes'] ?? null,
                ])->save();
                if ($stored !== null) {
                    $stored->forceFill(['attachable_id' => $payment->id])->save();
                }
                $this->saveAllocations($payment, $data['allocations'] ?? []);
                $this->audit->record('payment.reported', 'payment', $payment->id, null, $payment->refresh()->attributesToArray(),
                    ['via' => $via, 'allocations' => $data['allocations'] ?? []], $customer->id);
                if ($validate) {
                    $this->applyValidation($payment);
                }
                $via === 'portal'
                    ? PaymentReported::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status)
                    : PaymentRecorded::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);

                return $payment;
            });
        } catch (Throwable $e) {
            if ($stored instanceof StoredFile) {
                $this->proofs->discard($stored);
            }
            throw $e;
        }

        return $payment;
    }

    /**
     * Cobro confirmado por la pasarela de tarjetas (consulta a su API): se registra
     * validado (reported_via webhook, sin validador humano) y se aplica. Idempotente
     * por (medio, external_id): el mismo cobro externo devuelve el pago ya registrado.
     *
     * @param  list<array{invoice_id: string, amount_minor: int}>  $allocations
     */
    public function recordGatewayPayment(PaymentMethod $method, string $customerId, int $amountMinor, string $currency, string $externalId, int $feeMinor, array $allocations, ?string $notes = null): Payment
    {
        return DB::transaction(function () use ($method, $customerId, $amountMinor, $currency, $externalId, $feeMinor, $allocations, $notes): Payment {
            $existing = Payment::query()->where('payment_method_id', $method->id)->where('external_id', $externalId)->lockForUpdate()->first();
            if ($existing !== null) {
                return $existing;
            }
            $payment = new Payment;
            $payment->forceFill([
                'customer_id' => $customerId, 'payment_method_id' => $method->id, 'status' => 'reported', 'amount_minor' => $amountMinor,
                'currency' => $currency, 'fee_minor' => max(0, $feeMinor), 'external_id' => $externalId, 'bank_account_id' => $method->bank_account_id,
                'reported_via' => 'webhook', 'reported_by' => null, 'received_at' => now(), 'notes' => $notes,
            ])->save();
            $this->saveAllocations($payment, $allocations);
            $this->audit->record('payment.reported', 'payment', $payment->id, null, $payment->refresh()->attributesToArray(),
                ['via' => 'card_gateway', 'allocations' => $allocations], $customerId, ['type' => 'connector', 'id' => null]);
            $this->applyValidation($payment, true);
            PaymentRecorded::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);
            PaymentValidated::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);

            return $payment;
        });
    }

    /**
     * Finanzas valida un pago `reported` (voucher): aplica las asignaciones propuestas o las que indique.
     * No valida un pago que registró él mismo desde el panel (restricción no_self_validation de roles.json).
     *
     * @param  list<array{invoice_id: string, amount_minor: int}>|null  $allocations
     */
    public function validate(Payment $payment, ?array $allocations, ?int $version): Payment
    {
        return DB::transaction(function () use ($payment, $allocations, $version): Payment {
            $payment = $this->lock($payment, $version, 'reported', 'validar');
            if ($payment->reported_via !== 'portal' && $payment->reported_by !== null && $payment->reported_by === Auth::id()) {
                throw new ProblemException(403, 'self_validation', 'No puede validar un pago que registró usted mismo.');
            }
            // Las asignaciones guardadas al reportar se vuelven a verificar: el comprobante pudo anularse o pagarse mientras tanto.
            $allocations ??= $payment->allocations()->get(['invoice_id', 'amount_minor'])
                ->map(fn (PaymentAllocation $a) => ['invoice_id' => $a->invoice_id, 'amount_minor' => $a->amount_minor])->all();
            $payment->allocations()->delete();
            $this->saveAllocations($payment, $allocations);
            $this->applyValidation($payment);
            PaymentValidated::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);

            return $payment;
        });
    }

    public function reject(Payment $payment, string $reason, ?int $version): Payment
    {
        return DB::transaction(function () use ($payment, $reason, $version): Payment {
            $payment = $this->lock($payment, $version, 'reported', 'rechazar');
            $before = $payment->attributesToArray();
            $payment->forceFill(['status' => 'rejected', 'rejection_reason' => $reason] + $this->releaseReference($payment))->save();
            $this->audit->record('payment.rejected', 'payment', $payment->id, $before, $payment->refresh()->attributesToArray(), ['reason' => $reason], $payment->customer_id);
            PaymentRejected::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);

            return $payment;
        });
    }

    /** Anulación de un pago validado (registro erróneo): deja de contar y los comprobantes recuperan su saldo. */
    public function void(Payment $payment, string $reason, ?int $version): Payment
    {
        return DB::transaction(function () use ($payment, $reason, $version): Payment {
            $payment = $this->lock($payment, $version, 'validated', 'anular');
            $before = $payment->attributesToArray();
            $payment->forceFill(['status' => 'rejected', 'rejection_reason' => $reason] + $this->releaseReference($payment))->save();
            $invoices = $this->lockInvoices($payment->allocations()->pluck('invoice_id')->all());
            foreach ($invoices as $invoice) {
                $this->recalculate($invoice);
            }
            $this->audit->record('payment.voided', 'payment', $payment->id, $before, $payment->refresh()->attributesToArray(),
                ['reason' => $reason, 'reverted' => $payment->allocations()->get(['invoice_id', 'amount_minor'])->toArray()], $payment->customer_id);
            PaymentVoided::dispatch($payment->organization_id, $payment->id, $payment->customer_id, $payment->status);

            return $payment;
        });
    }

    /**
     * Saldo = total − aplicaciones de pagos validados; estado según docs/03 §3
     * (vencido prevalece hasta saldo cero). Requiere la fila bloqueada.
     *
     * @return bool true si quedó pagado en esta operación
     */
    public function recalculate(Invoice $invoice): bool
    {
        if (! in_array($invoice->status, [...self::OPEN_STATUSES, 'paid'], true)) {
            return false;
        }
        $paid = (int) PaymentAllocation::query()->where('invoice_id', $invoice->id)
            ->whereHas('payment', fn ($q) => $q->where('status', 'validated'))->sum('amount_minor');
        $balance = $invoice->total_minor - $paid;
        if ($balance < 0) {
            throw new ProblemException(409, 'allocation_exceeds_balance', "La aplicación supera el saldo del comprobante {$invoice->fullNumber()}.", ['invoice_id' => $invoice->id]);
        }
        $wasPaid = $invoice->status === 'paid';
        $overdue = $invoice->due_date !== null && $invoice->due_date->toDateString() < now()->toDateString();
        $status = match (true) {
            $balance === 0 => 'paid',
            $overdue => 'overdue',
            $paid > 0 => 'partially_paid',
            default => 'issued',
        };
        if ($status === $invoice->status && $balance === $invoice->balance_minor) {
            return false;
        }
        $before = $invoice->only(['status', 'balance_minor', 'paid_at']);
        $invoice->forceFill(['balance_minor' => $balance, 'status' => $status, 'paid_at' => $status === 'paid' ? ($invoice->paid_at ?? now()) : null])->save();
        $this->audit->record('invoice.balance_updated', 'invoice', $invoice->id, $before, $invoice->only(['status', 'balance_minor', 'paid_at']), [], $invoice->customer_id);
        if ($status === 'paid' && ! $wasPaid) {
            InvoicePaid::dispatch($invoice->organization_id, $invoice->id, $invoice->customer_id);

            return true;
        }

        return false;
    }

    /**
     * Un pago rechazado o anulado libera su número de operación (UNIQUE por medio):
     * el cliente puede reenviar la constancia corregida con la misma referencia.
     * La referencia queda en `notes` para trazabilidad.
     *
     * @return array<string, mixed>
     */
    private function releaseReference(Payment $payment): array
    {
        if ($payment->external_id === null) {
            return [];
        }
        $note = "Referencia original: {$payment->external_id}";

        return ['external_id' => null, 'notes' => trim(($payment->notes ? $payment->notes."\n" : '').$note)];
    }

    /** @param bool $byGateway validado por la pasarela: sin validador humano (el usuario en sesión puede ser el cliente del portal) */
    private function applyValidation(Payment $payment, bool $byGateway = false): void
    {
        $before = $payment->attributesToArray();
        $payment->forceFill(['status' => 'validated', 'validated_by' => $byGateway ? null : Auth::id(), 'validated_at' => now(), 'rejection_reason' => null])->save();
        foreach ($this->lockInvoices($payment->allocations()->pluck('invoice_id')->all()) as $invoice) {
            $this->recalculate($invoice);
        }
        $this->audit->record('payment.validated', 'payment', $payment->id, $before, $payment->refresh()->attributesToArray(),
            ['allocations' => $payment->allocations()->get(['invoice_id', 'amount_minor'])->toArray()], $payment->customer_id, $byGateway ? ['type' => 'connector', 'id' => null] : null);
    }

    /**
     * Comprobantes abiertos del mismo cliente y moneda; cada importe ≤ saldo y la suma ≤ importe del pago.
     * El excedente queda sin aplicar (saldo a favor: franja siguiente).
     *
     * @param  list<array{invoice_id: string, amount_minor: int}>  $allocations
     */
    private function saveAllocations(Payment $payment, array $allocations): void
    {
        $errors = [];
        $sum = 0;
        $seen = [];
        $invoices = $this->lockInvoices(array_column($allocations, 'invoice_id'));
        foreach (array_values($allocations) as $i => $row) {
            $invoice = $invoices[$row['invoice_id']] ?? null;
            $amount = (int) $row['amount_minor'];
            if ($invoice === null || $invoice->customer_id !== $payment->customer_id) {
                $errors["allocations.{$i}.invoice_id"] = ['El comprobante no existe o no es del cliente del pago.'];

                continue;
            }
            if (isset($seen[$invoice->id])) {
                $errors["allocations.{$i}.invoice_id"] = ['El comprobante está repetido.'];

                continue;
            }
            $seen[$invoice->id] = true;
            if (! in_array($invoice->status, self::OPEN_STATUSES, true)) {
                $errors["allocations.{$i}.invoice_id"] = ['El comprobante no tiene saldo por cobrar.'];
            } elseif (trim((string) $invoice->currency) !== trim((string) $payment->currency)) {
                $errors["allocations.{$i}.invoice_id"] = ['El comprobante está en otra moneda.'];
            } elseif ($amount < 1 || $amount > $invoice->balance_minor) {
                $errors["allocations.{$i}.amount_minor"] = ['El importe debe ser mayor que cero y no superar el saldo ('.$invoice->balance_minor.').'];
            }
            $sum += $amount;
        }
        if ($errors === [] && $sum > $payment->amount_minor) {
            $errors['allocations'] = ['La suma aplicada supera el importe del pago.'];
        }
        if ($errors !== []) {
            throw ProblemException::validation($errors);
        }
        foreach ($allocations as $row) {
            $allocation = new PaymentAllocation;
            $allocation->forceFill(['payment_id' => $payment->id, 'invoice_id' => $row['invoice_id'], 'amount_minor' => (int) $row['amount_minor'], 'currency' => $payment->currency])->save();
        }
        $payment->unsetRelation('allocations');
    }

    /**
     * Bloquea los comprobantes en orden de id (sin interbloqueos).
     *
     * @param  list<string>  $ids
     * @return array<string, Invoice>
     */
    private function lockInvoices(array $ids): array
    {
        $ids = array_values(array_unique(array_filter($ids, fn ($id) => is_string($id) && preg_match('/^[0-9a-f-]{36}$/i', $id) === 1)));
        if ($ids === []) {
            return [];
        }
        sort($ids);

        return Invoice::query()->whereIn('id', $ids)->orderBy('id')->lockForUpdate()->get()->keyBy('id')->all();
    }

    private function lock(Payment $payment, ?int $version, string $expected, string $verb): Payment
    {
        $payment = Payment::query()->lockForUpdate()->findOrFail($payment->id);
        if ($version !== null) {
            VersionGuard::check($payment, $version);
        }
        if ($payment->status !== $expected) {
            throw new ProblemException(409, 'invalid_transition', "No se puede {$verb} un pago en estado {$payment->status}.", ['status' => $payment->status]);
        }

        return $payment;
    }
}
