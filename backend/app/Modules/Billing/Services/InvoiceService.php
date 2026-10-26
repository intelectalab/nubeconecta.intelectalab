<?php

declare(strict_types=1);

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Events\EInvoiceAccepted;
use App\Modules\Billing\Events\EInvoiceRejected;
use App\Modules\Billing\Events\InvoiceDrafted;
use App\Modules\Billing\Events\InvoiceIssued;
use App\Modules\Billing\Events\InvoiceVoided;
use App\Modules\Billing\Jobs\SubmitEInvoice;
use App\Modules\Billing\Models\Invoice;
use App\Modules\Billing\Models\InvoiceItem;
use App\Modules\Billing\Models\PaymentAllocation;
use App\Modules\Brands\Services\DocumentNumberAllocator;
use App\Modules\Customers\Models\Customer;
use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Orders\Services\OrderTotals;
use App\Modules\Services\Models\Service;
use App\Modules\Services\Models\Subscription;
use App\Modules\Services\Support\Cycle;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Casos de uso de comprobantes (M-BIL §4, franja MVP): borrador desde el
 * pedido aprobado y desde la renovación, emisión con serie y número de BRD
 * (bloqueo de document_series, RN-BIL-016), envío al conector electrónico y
 * anulación sin pagos. Importes en céntimos, IGV de `tax_rates` (RN-BIL-023)
 * sobre la base gravada del total (RN-BIL-026), repartido entre las líneas.
 */
final class InvoiceService
{
    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
        private readonly DocumentNumberAllocator $numbers,
        private readonly SettingsReader $settings,
    ) {}

    /** OrderApproved → factura inicial en `draft` (M-BIL §9). Idempotente por pedido. */
    public function draftFromOrder(OrderApproved $event): ?Invoice
    {
        return DB::transaction(function () use ($event): ?Invoice {
            $exists = Invoice::query()->whereRaw("custom->>'order_id' = ?", [$event->id])->where('status', '<>', 'void')->exists();
            if ($exists) {
                return null;
            }
            $items = DB::table('order_items')->where('order_id', $event->id)->whereIn('id', $event->itemIds)->orderBy('created_at')->orderBy('id')->get();
            $start = now()->toDateString();
            $rate = null;
            $lines = [];
            foreach ($items as $item) {
                $config = json_decode((string) $item->config, true) ?: [];
                $cycle = $config['cycle'] ?? null;
                $setup = ($config['kind'] ?? null) === 'setup_fee';
                $recurring = ! $setup && Cycle::isRecurring($cycle);
                $rate ??= $config['tax']['rate_percent'] ?? null;
                $lines[] = [
                    'kind' => $recurring ? 'service' : 'one_time', 'service_id' => $setup ? null : $item->service_id, 'subscription_id' => null,
                    'product_id' => $item->product_id, 'description' => $item->description,
                    'period_start' => $recurring ? $start : null, 'period_end' => $recurring ? self::periodEnd($start, $cycle) : null,
                    'quantity' => (string) $item->quantity, 'unit_price_minor' => (int) $item->unit_price_minor,
                    'amount_minor' => OrderTotals::lineAmount((string) $item->quantity, (int) $item->unit_price_minor),
                    'taxed' => ($config['tax']['treatment'] ?? 'taxed') !== 'export',
                ];
            }
            if ($lines === []) {
                return null;
            }

            return $this->createDraft($event->customerId, $event->brandId, $event->currency, $lines, $rate ?? $this->taxRate()['rate_percent'], null, [
                'order_id' => $event->id, 'origin' => 'order',
            ]);
        });
    }

    /**
     * Borrador de renovación de una suscripción `active` (RN-BIL-001/002): un
     * solo comprobante no anulado por suscripción y periodo; bloquea la
     * suscripción, verifica dentro de la transacción y adelanta
     * `next_invoice_date` un ciclo.
     */
    public function draftRenewal(string $subscriptionId): ?Invoice
    {
        return DB::transaction(function () use ($subscriptionId): ?Invoice {
            $sub = Subscription::query()->lockForUpdate()->find($subscriptionId);
            if ($sub === null || $sub->status !== 'active' || ! Cycle::isRecurring($sub->cycle)) {
                return null;
            }
            $service = Service::query()->with('product')->find($sub->service_id);
            if ($service === null || $service->status !== 'active') {
                return null;
            }
            $start = $sub->next_invoice_date->toDateString();
            $duplicate = InvoiceItem::query()->where('subscription_id', $sub->id)->where('period_start', $start)
                ->whereIn('invoice_id', Invoice::query()->where('status', '<>', 'void')->select('id'))->exists();
            if ($duplicate) {
                return null;
            }
            $customer = Customer::query()->findOrFail($service->customer_id);
            $taxed = ! ($customer->tax_treatment === 'export' && $service->product?->export_eligible);
            $tax = $this->taxRate();
            $quantity = (string) $sub->quantity;
            $lines = [[
                'kind' => 'service', 'service_id' => $service->id, 'subscription_id' => $sub->id, 'product_id' => $service->product_id,
                'description' => "Renovación · {$service->label}", 'period_start' => $start, 'period_end' => self::periodEnd($start, $sub->cycle),
                'quantity' => $quantity, 'unit_price_minor' => $sub->price_minor,
                'amount_minor' => OrderTotals::lineAmount($quantity, $sub->price_minor), 'taxed' => $taxed,
            ]];
            $invoice = $this->createDraft($service->customer_id, $service->brand_id, trim((string) $sub->currency), $lines, $tax['rate_percent'], $start, [
                'origin' => 'renewal', 'subscription_id' => $sub->id, 'period_start' => $start,
            ]);
            $sub->forceFill(['next_invoice_date' => Cycle::add($start, $sub->cycle)])->save();

            return $invoice;
        });
    }

    /**
     * @param  list<array<string, mixed>>  $lines
     * @param  array<string, mixed>  $custom
     */
    private function createDraft(string $customerId, string $brandId, string $currency, array $lines, string $rate, ?string $dueDate, array $custom): Invoice
    {
        $customer = Customer::query()->findOrFail($customerId);
        $entity = DB::table('brands')->where('id', $brandId)->value('default_legal_entity_id');
        $totals = OrderTotals::compute($lines, $rate);
        $taxes = self::distributeTax($lines, $rate, $totals['tax_minor']);
        $taxRateId = $this->taxRate()['id'];
        $allExport = collect($lines)->every(fn (array $l) => ! $l['taxed']);

        $invoice = new Invoice;
        $invoice->forceFill([
            'legal_entity_id' => $entity, 'brand_id' => $brandId, 'customer_id' => $customer->id, 'type' => self::typeFor($customer),
            'status' => 'draft', 'fiscal_status' => 'not_applicable', 'tax_treatment' => $allExport ? 'export' : 'taxed', 'currency' => $currency,
            'due_date' => $dueDate, 'subtotal_minor' => $totals['subtotal_minor'], 'discount_minor' => 0, 'tax_minor' => $totals['tax_minor'],
            'total_minor' => $totals['total_minor'], 'balance_minor' => 0, 'custom' => $custom + ['tax_rate_percent' => $rate],
            'locale' => $customer->locale ?? 'es',
        ])->save();
        foreach ($lines as $i => $line) {
            $item = new InvoiceItem;
            $item->forceFill([
                'invoice_id' => $invoice->id, 'kind' => $line['kind'], 'service_id' => $line['service_id'], 'subscription_id' => $line['subscription_id'],
                'product_id' => $line['product_id'], 'description' => $line['description'], 'period_start' => $line['period_start'], 'period_end' => $line['period_end'],
                'quantity' => $line['quantity'], 'unit_price_minor' => $line['unit_price_minor'], 'discount_minor' => 0, 'subtotal_minor' => $line['amount_minor'],
                'tax_rate_id' => $line['taxed'] ? $taxRateId : null, 'tax_minor' => $taxes[$i], 'total_minor' => $line['amount_minor'] + $taxes[$i],
                'currency' => $currency, 'sort_order' => $i,
            ])->save();
        }
        $this->audit->record('invoice.drafted', 'invoice', $invoice->id, null, $invoice->refresh()->attributesToArray(), $custom, $customer->id);
        InvoiceDrafted::dispatch($invoice->organization_id, $invoice->id, $customer->id);

        return $invoice;
    }

    /**
     * Con `hub.billing.auto_issue` emite el borrador recién creado fuera de su
     * transacción: si falla (sin serie, p. ej.) el borrador queda y se reporta.
     */
    public function autoIssue(?Invoice $invoice): void
    {
        if ($invoice === null || ! config('hub.billing.auto_issue', false)) {
            return;
        }
        try {
            $this->issue($invoice, null);
        } catch (ProblemException $e) {
            report($e);
        }
    }

    /**
     * `draft → issued` (docs/03 §3): serie activa de la entidad emisora para el
     * tipo, número tomado con bloqueo en esta misma transacción (si algo falla
     * después, el número vuelve a quedar libre: sin huecos), saldo = total y
     * `fiscal_status = pending` con el envío electrónico en cola `billing`.
     */
    public function issue(Invoice $invoice, ?int $version): Invoice
    {
        return DB::transaction(function () use ($invoice, $version): Invoice {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($version !== null) {
                VersionGuard::check($invoice, $version);
            }
            if ($invoice->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', "Solo se emite un comprobante en borrador (estado actual: {$invoice->status}).", ['status' => $invoice->status]);
            }
            if (! $invoice->items()->exists()) {
                throw new ProblemException(409, 'invalid_transition', 'El comprobante no tiene líneas.');
            }
            $series = DB::table('document_series')->where('organization_id', $invoice->organization_id)->where('legal_entity_id', $invoice->legal_entity_id)
                ->where('document_type', $invoice->type)->where('is_active', true)->orderBy('series')->first(['id', 'series']);
            if ($series === null) {
                throw new ProblemException(409, 'series_missing', "La entidad emisora no tiene una serie activa para {$this->typeLabel($invoice->type)}.", ['type' => $invoice->type]);
            }
            $before = $invoice->attributesToArray();
            $number = $this->numbers->take((string) $series->id);
            $today = now()->toDateString();
            // Sin vencimiento propio (factura inicial): emisión + billing.initial_invoice_due_days (CFG; 0 = vence el mismo día).
            $dueDays = max(0, $this->settings->int('billing.initial_invoice_due_days', 7));
            $invoice->forceFill([
                'document_series_id' => $series->id, 'series' => $series->series, 'number' => $number, 'issue_date' => $today,
                'due_date' => $invoice->due_date?->toDateString() ?? now()->addDays($dueDays)->toDateString(), 'issued_at' => now(), 'issued_by' => Auth::id(),
                'status' => 'issued', 'fiscal_status' => 'pending', 'balance_minor' => $invoice->total_minor,
            ])->save();
            $this->audit->record('invoice.issued', 'invoice', $invoice->id, $before, $invoice->refresh()->attributesToArray(), ['number' => $invoice->fullNumber()], $invoice->customer_id);
            InvoiceIssued::dispatch($invoice->organization_id, $invoice->id, $invoice->customer_id);
            SubmitEInvoice::dispatch($invoice->id)->onQueue('billing')->afterCommit();

            return $invoice;
        });
    }

    /**
     * Anulación (docs/03 §3): emitido sin pagos aplicados → `void` y, si SUNAT ya lo aceptó, comunicación de baja
     * por el conector (`fiscal_status = voided`). La nota de crédito queda
     * pendiente (no es imprescindible para anular en la franja MVP).
     */
    public function void(Invoice $invoice, string $reason, ?int $version, EInvoiceConnector $connector): Invoice
    {
        return DB::transaction(function () use ($invoice, $reason, $version, $connector): Invoice {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($version !== null) {
                VersionGuard::check($invoice, $version);
            }
            if ($invoice->status === 'draft') {
                // docs/03 §3 admite draft → void, pero el CHECK de schema.sql exige serie y número fuera de `draft` (D-xx pendiente).
                throw new ProblemException(409, 'invalid_transition', 'Un borrador no se anula: no tiene número. Elimínelo (pendiente en la franja MVP) o emítalo.', ['status' => 'draft']);
            }
            if ($invoice->status !== 'issued') {
                throw new ProblemException(409, 'invalid_transition', "No se puede anular un comprobante en estado {$invoice->status}.", ['status' => $invoice->status]);
            }
            if ($invoice->status === 'issued' && $invoice->balance_minor !== $invoice->total_minor) {
                throw new ProblemException(409, 'invoice_has_payments', 'El comprobante tiene pagos aplicados: corríjalo con una nota de crédito.');
            }
            if ($invoice->status === 'issued' && $invoice->fiscal_status === 'pending') {
                throw new ProblemException(409, 'einvoice_pending', 'El comprobante aún espera la respuesta de SUNAT; anúlelo cuando esté aceptado o rechazado.');
            }
            if ($this->hasReportedPayments($invoice)) {
                throw new ProblemException(409, 'invoice_has_pending_payments', 'Hay vouchers por validar aplicados a este comprobante: valídelos contra otro comprobante o rechácelos antes de anular.');
            }
            $before = $invoice->attributesToArray();
            $fiscal = $invoice->fiscal_status;
            if ($invoice->fiscal_status === 'accepted') {
                $result = $connector->void((string) ($invoice->custom['einvoice']['reference'] ?? $invoice->fullNumber()), $reason, "invoice:{$invoice->id}:void");
                $this->submission($invoice, 'void', $result);
                if ($result['status'] !== 'accepted') {
                    throw new ProblemException(502, 'einvoice_error', 'El proveedor de facturación electrónica no aceptó la baja: '.$result['message']);
                }
                $fiscal = 'voided';
            }
            $invoice->forceFill(['status' => 'void', 'fiscal_status' => $fiscal, 'voided_at' => now(), 'void_reason' => $reason, 'balance_minor' => 0])->save();
            $this->audit->record('invoice.voided', 'invoice', $invoice->id, $before, $invoice->refresh()->attributesToArray(), ['reason' => $reason], $invoice->customer_id);
            $this->rewindRenewal($invoice);
            InvoiceVoided::dispatch($invoice->organization_id, $invoice->id, $invoice->customer_id);

            return $invoice;
        });
    }

    /**
     * Al anular una renovación, la suscripción vuelve a `next_invoice_date` =
     * inicio del periodo anulado: el job vuelve a facturar ese periodo (la
     * comprobación de duplicados ya ignora las anuladas). Si no, el periodo
     * quedaría sin facturar para siempre.
     */
    private function rewindRenewal(Invoice $invoice): void
    {
        $custom = $invoice->custom ?? [];
        if (($custom['origin'] ?? null) !== 'renewal' || empty($custom['subscription_id']) || empty($custom['period_start'])) {
            return;
        }
        $sub = Subscription::query()->lockForUpdate()->find($custom['subscription_id']);
        if ($sub !== null && $sub->next_invoice_date->toDateString() > (string) $custom['period_start']) {
            $sub->forceFill(['next_invoice_date' => (string) $custom['period_start']])->save();
        }
    }

    /** Pagos `reported` (vouchers por validar) con aplicación a este comprobante. */
    private function hasReportedPayments(Invoice $invoice): bool
    {
        return PaymentAllocation::query()->where('invoice_id', $invoice->id)->whereHas('payment', fn ($q) => $q->where('status', 'reported'))->exists();
    }

    /**
     * Pedido anulado (docs/03 §7, draft/approved → cancelled: "factura borrador
     * a void"): el borrador se descarta (el esquema no admite `void` sin número)
     * y el comprobante emitido sin pagos se anula. Con pagos (o SUNAT pendiente)
     * se deja, se audita `invoice.cancel_skipped` y finanzas lo resuelve con nota de crédito.
     */
    public function cancelForOrder(string $orderId, string $reason, EInvoiceConnector $connector): void
    {
        $invoices = Invoice::query()->whereRaw("custom->>'order_id' = ?", [$orderId])->where('status', '<>', 'void')->get();
        foreach ($invoices as $invoice) {
            $this->cancelDependent($invoice, $reason, $connector);
        }
    }

    /** Servicio cancelado: sus renovaciones abiertas sin pagos se anulan (o se descartan si son borrador). */
    public function cancelForService(string $serviceId, string $reason, EInvoiceConnector $connector): void
    {
        $subscriptions = Subscription::query()->where('service_id', $serviceId)->pluck('id')->all();
        if ($subscriptions === []) {
            return;
        }
        $invoices = Invoice::query()->whereRaw("custom->>'origin' = 'renewal'")->whereIn(DB::raw("custom->>'subscription_id'"), $subscriptions)
            ->whereIn('status', ['draft', ...PaymentService::OPEN_STATUSES])->get();
        foreach ($invoices as $invoice) {
            $this->cancelDependent($invoice, $reason, $connector);
        }
    }

    private function cancelDependent(Invoice $invoice, string $reason, EInvoiceConnector $connector): void
    {
        try {
            if ($invoice->status === 'draft') {
                $this->discardDraft($invoice, $reason);
            } elseif ($invoice->status === 'issued' && $invoice->balance_minor === $invoice->total_minor) {
                $this->void($invoice, $reason, null, $connector);
            } else {
                throw new ProblemException(409, 'invoice_has_payments', "El comprobante {$invoice->fullNumber()} tiene pagos: requiere nota de crédito.");
            }
        } catch (ProblemException $e) {
            // Queda abierto para que finanzas lo resuelva; se deja constancia.
            $this->audit->record('invoice.cancel_skipped', 'invoice', $invoice->id, null, null, ['reason' => $reason, 'code' => $e->problemCode, 'detail' => $e->getMessage()], $invoice->customer_id);
            report($e);
        }
    }

    /** Borrador sin número: se elimina con sus líneas (auditado como `invoice.discarded`). */
    public function discardDraft(Invoice $invoice, string $reason): void
    {
        DB::transaction(function () use ($invoice, $reason): void {
            $invoice = Invoice::query()->lockForUpdate()->findOrFail($invoice->id);
            if ($invoice->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', 'Solo se descarta un comprobante en borrador.', ['status' => $invoice->status]);
            }
            $before = $invoice->attributesToArray();
            $invoice->items()->delete();
            $invoice->delete();
            $this->audit->record('invoice.discarded', 'invoice', $invoice->id, $before, null, ['reason' => $reason], $invoice->customer_id);
            $this->rewindRenewal($invoice);
        });
    }

    /** Envío electrónico (job SubmitEInvoice): una fila de einvoice_submissions por intento; la numeración no cambia al reintentar. */
    public function submit(string $invoiceId, EInvoiceConnector $connector): void
    {
        DB::transaction(function () use ($invoiceId, $connector): void {
            $invoice = Invoice::query()->lockForUpdate()->find($invoiceId);
            if ($invoice === null || $invoice->status === 'draft' || ! in_array($invoice->fiscal_status, ['pending'], true)) {
                return;
            }
            $result = $connector->submit($this->document($invoice), "invoice:{$invoice->id}:issue");
            $this->submission($invoice, 'issue', $result);
            if ($result['status'] === 'error') {
                return; // sigue `pending`: el job reintenta o finanzas reenvía
            }
            $before = $invoice->attributesToArray();
            $accepted = $result['status'] === 'accepted';
            $invoice->forceFill([
                'fiscal_status' => $accepted ? 'accepted' : 'rejected',
                'custom' => array_merge($invoice->custom ?? [], ['einvoice' => [
                    'provider' => $result['provider'], 'reference' => $result['reference'], 'code' => $result['code'],
                    'message' => $result['message'], 'cdr' => $result['cdr'], 'simulated' => $result['simulated'],
                ]]),
            ])->save();
            $this->audit->record($accepted ? 'invoice.einvoice_accepted' : 'invoice.einvoice_rejected', 'invoice', $invoice->id, $before, $invoice->refresh()->attributesToArray(),
                ['provider' => $result['provider'], 'code' => $result['code'], 'simulated' => $result['simulated']], $invoice->customer_id, ['type' => 'connector', 'id' => null]);
            ($accepted ? EInvoiceAccepted::class : EInvoiceRejected::class)::dispatch($invoice->organization_id, $invoice->id, $invoice->customer_id);
        });
    }

    /**
     * Datos del comprobante para el conector y la representación impresa.
     *
     * @return array<string, mixed>
     */
    public function document(Invoice $invoice): array
    {
        $invoice->loadMissing(['items', 'customer', 'brand', 'legalEntity']);
        $entity = $invoice->legalEntity;
        $customer = $invoice->customer;
        $taxable = $invoice->items->where('tax_minor', '>', 0)->sum('subtotal_minor');

        return [
            'id' => $invoice->id, 'type' => $invoice->type, 'type_label' => $this->typeLabel($invoice->type),
            'series' => $invoice->series, 'number' => $invoice->number, 'full_number' => $invoice->fullNumber(),
            'issue_date' => $invoice->issue_date?->toDateString(), 'due_date' => $invoice->due_date?->toDateString(),
            'currency' => trim((string) $invoice->currency), 'tax_treatment' => $invoice->tax_treatment,
            'issuer' => ['legal_name' => $entity?->legal_name, 'tax_id_type' => $entity?->tax_id_type, 'tax_id' => $entity?->tax_id, 'address' => $entity?->fiscal_address, 'brand' => $invoice->brand?->name],
            'customer' => ['legal_name' => $customer?->legal_name, 'tax_id_type' => $customer?->tax_id_type, 'tax_id' => $customer?->tax_id, 'address' => $customer?->address, 'code' => $customer?->code],
            'items' => $invoice->items->map(fn (InvoiceItem $i) => [
                'description' => $i->description, 'quantity' => (string) $i->quantity, 'unit_price_minor' => $i->unit_price_minor,
                'subtotal_minor' => $i->subtotal_minor, 'tax_minor' => $i->tax_minor, 'total_minor' => $i->total_minor,
                'period_start' => $i->period_start?->toDateString(), 'period_end' => $i->period_end?->toDateString(),
            ])->all(),
            'taxable_minor' => (int) $taxable, 'unaffected_minor' => $invoice->subtotal_minor - (int) $taxable,
            'subtotal_minor' => $invoice->subtotal_minor, 'tax_minor' => $invoice->tax_minor, 'total_minor' => $invoice->total_minor,
            'tax_rate_percent' => $invoice->custom['tax_rate_percent'] ?? null,
        ];
    }

    public function typeLabel(string $type): string
    {
        return ['invoice' => 'Factura electrónica', 'receipt' => 'Boleta de venta electrónica', 'credit_note' => 'Nota de crédito electrónica', 'debit_note' => 'Nota de débito electrónica'][$type] ?? $type;
    }

    /**
     * Factura para clientes con RUC y del extranjero (docs/08 §21: "facturas a
     * clientes del extranjero sin RUC"); boleta para DNI, CE, pasaporte o sin
     * documento en Perú. Criterio SUNAT habitual, sin regla RN en la doc (D-xx).
     */
    public static function typeFor(Customer $customer): string
    {
        return $customer->tax_id_type === 'ruc' || ($customer->country !== null && $customer->country !== 'PE') ? 'invoice' : 'receipt';
    }

    /**
     * IGV por línea con el total del comprobante calculado sobre la base
     * gravada (RN-BIL-026); la diferencia de redondeo va a la línea gravada
     * de mayor importe, así la suma de líneas cuadra con el total.
     *
     * @param  list<array{amount_minor: int, taxed: bool}>  $lines
     * @return list<int>
     */
    public static function distributeTax(array $lines, string $rate, int $totalTax): array
    {
        $taxes = array_map(fn (array $l) => $l['taxed'] ? OrderTotals::tax($l['amount_minor'], $rate) : 0, $lines);
        $diff = $totalTax - array_sum($taxes);
        if ($diff !== 0) {
            $max = null;
            foreach ($lines as $i => $l) {
                if ($l['taxed'] && ($max === null || $l['amount_minor'] > $lines[$max]['amount_minor'])) {
                    $max = $i;
                }
            }
            if ($max !== null) {
                $taxes[$max] = max(0, $taxes[$max] + $diff);
            }
        }

        return $taxes;
    }

    private static function periodEnd(string $start, string $cycle): string
    {
        return CarbonImmutable::parse(Cycle::add($start, $cycle))->subDay()->toDateString();
    }

    /** @param array<string, mixed> $result */
    private function submission(Invoice $invoice, string $operation, array $result): void
    {
        $attempt = (int) DB::table('einvoice_submissions')->where('invoice_id', $invoice->id)->where('operation', $operation)->max('attempt') + 1;
        DB::table('einvoice_submissions')->insert([
            'id' => (string) Str::uuid7(), 'organization_id' => $invoice->organization_id, 'invoice_id' => $invoice->id,
            'provider' => $result['provider'], 'operation' => $operation, 'attempt' => $attempt,
            'status' => $result['status'], 'provider_reference' => $result['reference'], 'response_code' => $result['code'],
            'response_message' => $result['message'], 'sent_at' => now(), 'responded_at' => now(), 'created_by' => Auth::id(),
        ]);
    }

    /** @return array{id: string, rate_percent: string} tasa de IGV vigente (RN-BIL-023: nunca fija en el código) */
    private function taxRate(): array
    {
        $today = now()->toDateString();
        $row = DB::table('tax_rates')->where('organization_id', $this->organization->id())->where('code', 'igv')
            ->where('effective_from', '<=', $today)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $today))
            ->orderByDesc('effective_from')->first(['id', 'rate_percent']);
        if ($row === null) {
            throw new ProblemException(409, 'tax_rate_missing', 'No hay tasa de IGV vigente en tax_rates.');
        }

        return ['id' => (string) $row->id, 'rate_percent' => (string) $row->rate_percent];
    }
}
