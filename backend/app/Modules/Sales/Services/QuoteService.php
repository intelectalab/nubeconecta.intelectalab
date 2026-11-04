<?php

declare(strict_types=1);

namespace App\Modules\Sales\Services;

use Closure;
use App\Modules\Orders\Services\OrderTotals;
use App\Modules\Sales\Models\Quote;
use App\Modules\Sales\Models\QuoteItem;
use App\Modules\Sales\Models\QuoteVersion;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class QuoteService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(): array
    {
        $org = $this->organization->id();
        return [
            'brand_id' => ['required', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at'), function (string $attribute, mixed $value, Closure $fail): void {
                if (! request()->filled('customer_id') && ! request()->filled('lead_id')) {
                    $fail('Debe indicar un cliente o un prospecto.');
                }
            }],
            'customer_id' => ['nullable', 'uuid', 'required_without:lead_id', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'lead_id' => ['nullable', 'uuid', 'required_without:customer_id', Rule::exists('leads', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'owner_id' => ['nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)],
            'currency' => ['required', Rule::in(['PEN', 'USD'])],
            'valid_until' => ['nullable', 'date', 'after_or_equal:today'],
            'locale' => ['sometimes', 'string', 'max:10'],
            'terms' => ['nullable', 'string', 'max:10000'],
            'items' => ['required', 'array', 'min:1', 'max:100'],
            'items.*.description' => ['required', 'string', 'max:1000'],
            'items.*.charge_type' => ['required', Rule::in(['one_time', 'recurring'])],
            'items.*.cycle' => ['required_if:items.*.charge_type,recurring', 'nullable', Rule::in(['monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'triennial'])],
            'items.*.quantity' => ['required', 'numeric', 'gt:0', 'max:100000', 'decimal:0,3'],
            'items.*.unit_price_minor' => ['required', 'integer', 'min:0'],
            'items.*.discount_minor' => ['sometimes', 'integer', 'min:0'],
            'items.*.product_id' => ['nullable', 'uuid', Rule::exists('products', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'items.*.plan_id' => ['nullable', 'uuid', Rule::exists('plans', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
        ];
    }

    public function updateRules(): array
    {
        $rules = $this->rules();
        $rules['version'] = ['required', 'integer'];
        unset($rules['brand_id']);
        // PATCH may leave the party unchanged; the resulting quote is checked in updateDraft().
        $rules['customer_id'] = ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $this->organization->id())->whereNull('deleted_at')];
        $rules['lead_id'] = ['sometimes', 'nullable', 'uuid', Rule::exists('leads', 'id')->where('organization_id', $this->organization->id())->whereNull('deleted_at')];
        $rules['owner_id'] = ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $this->organization->id())];
        $rules['currency'] = ['sometimes', Rule::in(['PEN', 'USD'])];
        $rules['valid_until'] = ['sometimes', 'nullable', 'date', 'after_or_equal:today'];
        $rules['locale'] = ['sometimes', 'string', 'max:10'];
        $rules['terms'] = ['sometimes', 'nullable', 'string', 'max:10000'];
        $rules['change_note'] = ['sometimes', 'nullable', 'string', 'max:2000'];
        return $rules;
    }

    /** @param array<string, mixed> $data */
    public function create(array $data, ?string $idempotencyKey = null): Quote
    {
        $this->assertParty($data['customer_id'] ?? null, $data['lead_id'] ?? null);
        $rate = $this->taxRate();
        $totals = $this->totals($data['items'], $rate);

        return DB::transaction(function () use ($data, $totals): Quote {
            $quote = new Quote;
            $quote->forceFill([
                'number' => $this->nextNumber(), 'brand_id' => $data['brand_id'], 'customer_id' => $data['customer_id'] ?? null,
                'lead_id' => $data['lead_id'] ?? null, 'owner_id' => $data['owner_id'] ?? null, 'currency' => $data['currency'],
                'valid_until' => $data['valid_until'] ?? null, 'status' => 'draft', 'current_version' => 1,
            ])->save();
            $version = $this->createVersion($quote, 1, $data, $totals);
            $this->createItems($quote, $version, $data['items']);
            $this->audit->record('quote.created', 'quote', $quote->id, null, $this->auditState($quote, $version, $totals), [], $quote->customer_id);
            return $this->loaded($quote);
        });
    }

    /** @param array<string, mixed> $data */
    public function updateDraft(Quote $quote, array $data): Quote
    {
        return DB::transaction(function () use ($quote, $data): Quote {
            $quote = Quote::query()->lockForUpdate()->findOrFail($quote->id);
            VersionGuard::check($quote, $data['version']);
            if ($quote->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', 'Solo se edita una cotización en borrador.', ['status' => $quote->status]);
            }
            $customerId = array_key_exists('customer_id', $data) ? $data['customer_id'] : $quote->customer_id;
            $leadId = array_key_exists('lead_id', $data) ? $data['lead_id'] : $quote->lead_id;
            $this->assertParty($customerId, $leadId);
            $before = $quote->attributesToArray() + ['current_version_data' => $quote->currentVersion()->first()?->attributesToArray()];
            $currency = $data['currency'] ?? $quote->currency;
            $rate = $this->taxRate();
            $totals = $this->totals($data['items'], $rate);
            $quote->forceFill([
                'customer_id' => $customerId, 'lead_id' => $leadId, 'owner_id' => array_key_exists('owner_id', $data) ? $data['owner_id'] : $quote->owner_id,
                'currency' => $currency, 'valid_until' => array_key_exists('valid_until', $data) ? $data['valid_until'] : $quote->valid_until,
                'current_version' => $quote->current_version + 1,
            ])->save();
            $previousVersion = $quote->currentVersion()->first();
            $versionData = $data + [
                'currency' => $currency, 'valid_until' => $quote->valid_until,
                'locale' => $previousVersion?->locale ?? 'es', 'terms' => $previousVersion?->terms,
            ];
            $version = $this->createVersion($quote, $quote->current_version, $versionData, $totals, $previousVersion?->locale ?? 'es');
            $this->createItems($quote, $version, $data['items']);
            $this->audit->record('quote.updated', 'quote', $quote->id, $before, $this->auditState($quote, $version, $totals), [], $quote->customer_id);
            return $this->loaded($quote);
        });
    }

    public function send(Quote $quote, int $version): Quote { return $this->transition($quote, $version, 'draft', 'sent', ['sent_at' => now()], 'quote.sent'); }
    public function accept(Quote $quote, int $version): Quote { return $this->transition($quote, $version, 'sent', 'accepted', ['accepted_at' => now()], 'quote.accepted'); }
    public function reject(Quote $quote, string $reason, int $version): Quote { return $this->transition($quote, $version, 'sent', 'rejected', ['rejected_at' => now(), 'rejection_reason' => $reason], 'quote.rejected', ['reason' => $reason]); }
    public function expire(Quote $quote, int $version): Quote { return $this->transition($quote, $version, 'sent', 'expired', [], 'quote.expired'); }

    public function deleteDraft(Quote $quote, int $version): void
    {
        DB::transaction(function () use ($quote, $version): void {
            $quote = Quote::query()->lockForUpdate()->findOrFail($quote->id);
            VersionGuard::check($quote, $version);
            if ($quote->status !== 'draft') {
                throw new ProblemException(409, 'invalid_transition', 'Solo se elimina una cotización en borrador.', ['status' => $quote->status]);
            }
            $before = $quote->attributesToArray();
            $quote->delete();
            $this->audit->record('quote.deleted', 'quote', $quote->id, $before, null, [], $quote->customer_id);
        });
    }

    /** @param array<string, mixed> $state @param array<string, mixed> $metadata */
    private function transition(Quote $quote, int $version, string $from, string $to, array $state, string $action, array $metadata = []): Quote
    {
        return DB::transaction(function () use ($quote, $version, $from, $to, $state, $action, $metadata): Quote {
            $quote = Quote::query()->lockForUpdate()->findOrFail($quote->id);
            VersionGuard::check($quote, $version);
            if ($quote->status !== $from) {
                throw ProblemException::validation(['status' => ["No se puede cambiar de {$quote->status} a {$to}."]]);
            }
            $before = $quote->attributesToArray();
            $quote->forceFill(['status' => $to] + $state)->save();
            $this->audit->record($action, 'quote', $quote->id, $before, $quote->refresh()->attributesToArray(), $metadata, $quote->customer_id);
            return $this->loaded($quote);
        });
    }

    /** @param array<string, mixed> $data @param array{one_time_total_minor:int,recurring_total_minor:int,tax_minor:int} $totals */
    private function createVersion(Quote $quote, int $number, array $data, array $totals, string $fallbackLocale = 'es'): QuoteVersion
    {
        $version = new QuoteVersion;
        $version->forceFill([
            'quote_id' => $quote->id, 'version_number' => $number, 'locale' => $data['locale'] ?? $fallbackLocale,
            'currency' => $data['currency'] ?? $quote->currency, 'valid_until' => $data['valid_until'] ?? $quote->valid_until,
            'one_time_total_minor' => $totals['one_time_total_minor'], 'recurring_total_minor' => $totals['recurring_total_minor'],
            'tax_minor' => $totals['tax_minor'], 'terms' => $data['terms'] ?? null, 'change_note' => $data['change_note'] ?? null,
        ])->save();
        return $version;
    }

    /** @param list<array<string, mixed>> $items */
    private function createItems(Quote $quote, QuoteVersion $version, array $items): void
    {
        foreach (array_values($items) as $sort => $data) {
            $amount = max(0, OrderTotals::lineAmount((string) $data['quantity'], (int) $data['unit_price_minor']) - (int) ($data['discount_minor'] ?? 0));
            $item = new QuoteItem;
            $item->forceFill([
                'quote_version_id' => $version->id, 'product_id' => $data['product_id'] ?? null, 'plan_id' => $data['plan_id'] ?? null,
                'description' => $data['description'], 'charge_type' => $data['charge_type'], 'cycle' => $data['charge_type'] === 'recurring' ? ($data['cycle'] ?? null) : null,
                'quantity' => $data['quantity'], 'unit_price_minor' => $data['unit_price_minor'], 'discount_minor' => $data['discount_minor'] ?? 0,
                'total_minor' => $amount, 'currency' => $version->currency, 'sort_order' => $sort,
            ])->save();
        }
    }

    /** @param list<array<string, mixed>> $items @return array{one_time_total_minor:int,recurring_total_minor:int,tax_minor:int} */
    private function totals(array $items, string $rate): array
    {
        $one = 0; $recurring = 0;
        foreach ($items as $item) {
            $line = max(0, OrderTotals::lineAmount((string) $item['quantity'], (int) $item['unit_price_minor']) - (int) ($item['discount_minor'] ?? 0));
            if ($item['charge_type'] === 'one_time') { $one += $line; } else { $recurring += $line; }
        }
        return ['one_time_total_minor' => $one, 'recurring_total_minor' => $recurring, 'tax_minor' => OrderTotals::tax($one + $recurring, $rate)];
    }

    private function taxRate(): string
    {
        $today = now()->toDateString();
        $rate = DB::table('tax_rates')->where('organization_id', $this->organization->id())->where('code', 'igv')->where('effective_from', '<=', $today)
            ->where(fn ($q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $today))->orderByDesc('effective_from')->value('rate_percent');
        if ($rate === null) { throw new ProblemException(409, 'tax_rate_missing', 'No hay tasa de IGV vigente en tax_rates.'); }
        return (string) $rate;
    }

    private function nextNumber(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'quote', 'prefix' => 'COT', 'padding' => 6, 'next_value' => 1]);
        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'quote'])->code;
    }

    private function assertParty(?string $customerId, ?string $leadId): void
    {
        if ($customerId === null && $leadId === null) { throw ProblemException::validation(['customer_id' => ['Debe indicar un cliente o un prospecto.']]); }
    }

    /** @return array<string, mixed> */
    private function auditState(Quote $quote, QuoteVersion $version, array $totals): array
    {
        return ['id' => $quote->id, 'number' => $quote->number, 'status' => $quote->status, 'current_version' => $quote->current_version, 'version_id' => $version->id] + $totals;
    }

    private function loaded(Quote $quote): Quote
    {
        return $quote->load(['currentVersion.items', 'customer:id,code,legal_name,trade_name', 'lead:id,name,company_name', 'brand:id,name', 'owner:id,name']);
    }
}
