<?php

declare(strict_types=1);

namespace App\Modules\Billing\Services;

use App\Modules\Billing\Events\DunningNoticeDue;
use App\Modules\Billing\Events\InvoiceOverdue;
use App\Modules\Billing\Models\Invoice;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Cobranza (M-BIL §4 flujos 8 y 15), franja MVP: vencimiento diario
 * (`issued`/`partially_paid` → `overdue`), antigüedad de deuda por cliente y
 * moneda, y avisos según `billing.dunning.default_sequence` materializada en
 * dunning_sequences/dunning_stages. Sin recargo por mora (D-04) ni suspensión
 * automática (etapa suspend_service se omite). No hay canal de correo todavía:
 * el aviso queda `scheduled` con `detail.delivery = pending_channel`.
 */
final class CollectionsService
{
    public const BUCKETS = ['current', 'd1_30', 'd31_60', 'd61_90', 'd90_plus'];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly CurrentOrganization $organization,
        private readonly SettingsReader $settings,
    ) {}

    public static function bucket(?string $dueDate, string $today): string
    {
        if ($dueDate === null || $dueDate >= $today) {
            return 'current';
        }
        $days = (int) CarbonImmutable::parse($dueDate)->diffInDays(CarbonImmutable::parse($today));

        return match (true) {
            $days <= 30 => 'd1_30',
            $days <= 60 => 'd31_60',
            $days <= 90 => 'd61_90',
            default => 'd90_plus',
        };
    }

    /**
     * Deuda abierta por cliente y moneda, por tramos de días vencidos (al día, 1-30, 31-60, 61-90, más de 90).
     *
     * @return list<array<string, mixed>>
     */
    public function aging(?string $customerId = null, ?string $currency = null, ?string $today = null): array
    {
        $today ??= now()->toDateString();
        $rows = Invoice::query()->with('customer:id,code,legal_name,trade_name')
            ->whereIn('status', PaymentService::OPEN_STATUSES)->where('balance_minor', '>', 0)
            ->when($customerId, fn ($q) => $q->where('customer_id', $customerId))
            ->when($currency, fn ($q) => $q->where('currency', $currency))
            ->orderBy('customer_id')->orderBy('due_date')->get(['id', 'customer_id', 'currency', 'due_date', 'balance_minor']);
        $out = [];
        foreach ($rows as $invoice) {
            $cur = trim((string) $invoice->currency);
            $key = $invoice->customer_id.'|'.$cur;
            $out[$key] ??= [
                'customer' => $invoice->customer === null ? null : ['id' => $invoice->customer->id, 'code' => $invoice->customer->code, 'legal_name' => $invoice->customer->legal_name, 'trade_name' => $invoice->customer->trade_name],
                'customer_id' => $invoice->customer_id, 'currency' => $cur,
                'buckets' => array_fill_keys(self::BUCKETS, 0), 'total_minor' => 0, 'overdue_minor' => 0, 'invoices' => 0, 'oldest_due_date' => null,
            ];
            $bucket = self::bucket($invoice->due_date?->toDateString(), $today);
            $out[$key]['buckets'][$bucket] += $invoice->balance_minor;
            $out[$key]['total_minor'] += $invoice->balance_minor;
            $out[$key]['overdue_minor'] += $bucket === 'current' ? 0 : $invoice->balance_minor;
            $out[$key]['invoices']++;
            $out[$key]['oldest_due_date'] ??= $invoice->due_date?->toDateString();
        }
        $last = DB::table('payments')->where('organization_id', $this->organization->id())->where('status', 'validated')
            ->whereIn('customer_id', array_unique(array_column($out, 'customer_id')))->groupBy('customer_id')
            ->selectRaw('customer_id, max(received_at) as last_at')->pluck('last_at', 'customer_id');
        foreach ($out as &$row) {
            $row['last_payment_at'] = isset($last[$row['customer_id']]) ? CarbonImmutable::parse((string) $last[$row['customer_id']])->toIso8601String() : null;
        }
        unset($row);
        $list = array_values($out);
        usort($list, fn ($a, $b) => [$b['overdue_minor'], $b['total_minor']] <=> [$a['overdue_minor'], $a['total_minor']]);

        return $list;
    }

    /** issued/partially_paid con due_date < hoy y saldo → overdue (docs/03 §3). */
    public function markOverdue(?string $today = null): int
    {
        $today ??= now()->toDateString();
        $count = 0;
        $ids = Invoice::query()->whereIn('status', ['issued', 'partially_paid'])->where('balance_minor', '>', 0)
            ->whereNotNull('due_date')->where('due_date', '<', $today)->pluck('id');
        foreach ($ids as $id) {
            DB::transaction(function () use ($id, $today, &$count): void {
                $invoice = Invoice::query()->lockForUpdate()->find($id);
                if ($invoice === null || ! in_array($invoice->status, ['issued', 'partially_paid'], true) || $invoice->balance_minor === 0 || $invoice->due_date?->toDateString() >= $today) {
                    return;
                }
                $before = $invoice->only(['status']);
                $invoice->forceFill(['status' => 'overdue'])->save();
                $this->audit->record('invoice.overdue', 'invoice', $invoice->id, $before, ['status' => 'overdue'], [], $invoice->customer_id, ['type' => 'system', 'id' => null]);
                InvoiceOverdue::dispatch($invoice->organization_id, $invoice->id, $invoice->customer_id);
                $count++;
            });
        }

        return $count;
    }

    /**
     * Avisos del día: por comprobante abierto, la etapa `send_notice` más reciente
     * cuya fecha (vencimiento + offset) ya llegó y que aún no tiene evento
     * (único por comprobante y etapa: sin duplicados). Las etapas omitidas por
     * haber pasado sin ejecutar no se reenvían.
     */
    public function runDunning(?string $today = null): int
    {
        $today ??= now()->toDateString();
        $stages = $this->stages();
        $notices = array_values(array_filter($stages, fn ($s) => $s->action === 'send_notice'));
        if ($notices === []) {
            return 0;
        }
        $offsets = array_map(fn ($s) => (int) $s->offset_days, $notices);
        $maxAhead = max(0, -min($offsets));
        $created = 0;
        Invoice::query()->whereIn('status', PaymentService::OPEN_STATUSES)->where('balance_minor', '>', 0)->whereNotNull('due_date')
            ->where('due_date', '<=', CarbonImmutable::parse($today)->addDays($maxAhead)->toDateString())
            ->orderBy('due_date')->orderBy('id')
            ->chunkById(200, function ($invoices) use ($notices, $today, &$created): void {
                foreach ($invoices as $invoice) {
                    $due = CarbonImmutable::parse($invoice->due_date->toDateString());
                    $stage = null;
                    foreach ($notices as $candidate) {
                        $date = $due->addDays((int) $candidate->offset_days)->toDateString();
                        if ($date <= $today && ($stage === null || (int) $candidate->offset_days > (int) $stage->offset_days)) {
                            $stage = $candidate;
                        }
                    }
                    if ($stage !== null && $this->notice($invoice, $stage, $due)) {
                        $created++;
                    }
                }
            });

        return $created;
    }

    private function notice(Invoice $invoice, object $stage, CarbonImmutable $due): bool
    {
        $channels = array_values(array_filter(explode(',', trim((string) $stage->channels, '{}'))));
        $recipient = DB::table('contacts')->where('customer_id', $invoice->customer_id)->whereNull('deleted_at')
            ->whereRaw('? = ANY(roles)', [(string) $stage->recipient_contact_role])->whereNotNull('email')
            ->orderByDesc('is_primary')->orderBy('created_at')->value('email');
        $id = (string) Str::uuid();
        $inserted = DB::table('dunning_events')->insertOrIgnore([
            'id' => $id, 'organization_id' => $invoice->organization_id, 'invoice_id' => $invoice->id, 'dunning_stage_id' => $stage->id,
            'action' => 'send_notice', 'status' => 'scheduled',
            'scheduled_for' => $due->addDays((int) $stage->offset_days)->setTimeFromTimeString((string) $stage->send_time)->toIso8601String(),
            'detail' => json_encode([
                'offset_days' => (int) $stage->offset_days, 'channels' => $channels, 'template' => $stage->notification_template_code,
                'recipient' => $recipient, 'balance_minor' => $invoice->balance_minor, 'currency' => trim((string) $invoice->currency),
                // Sin canal de correo en el sistema todavía (Notifications): queda pendiente de envío.
                'delivery' => 'pending_channel',
            ], JSON_THROW_ON_ERROR),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        if ($inserted === 0) {
            return false;
        }
        $this->audit->record('dunning.notice_scheduled', 'invoice', $invoice->id, null, ['dunning_event_id' => $id, 'offset_days' => (int) $stage->offset_days],
            [], $invoice->customer_id, ['type' => 'system', 'id' => null]);
        DunningNoticeDue::dispatch($invoice->organization_id, $id, $invoice->id);

        return true;
    }

    /**
     * Etapas activas de la secuencia general; si no existe, se materializa desde
     * `billing.dunning.default_sequence` (timing before_due/on_due/after_due + days → offset_days).
     *
     * @return list<object>
     */
    public function stages(): array
    {
        $org = $this->organization->id();
        $sequence = DB::table('dunning_sequences')->where('organization_id', $org)->where('scope_type', 'global')->value('id');
        if ($sequence === null) {
            $sequence = (string) Str::uuid();
            DB::table('dunning_sequences')->insertOrIgnore(['id' => $sequence, 'organization_id' => $org, 'name' => 'Secuencia general', 'scope_type' => 'global', 'scope_id' => null]);
            $sequence = (string) DB::table('dunning_sequences')->where('organization_id', $org)->where('scope_type', 'global')->value('id');
            $config = (array) ($this->settings->get('billing.dunning.default_sequence', []) ?? []);
            foreach ((array) ($config['stages'] ?? []) as $stage) {
                $days = (int) ($stage['days'] ?? 0);
                $offset = match ($stage['timing'] ?? 'on_due') {
                    'before_due' => -$days,
                    'after_due' => $days,
                    default => 0,
                };
                foreach ((array) ($stage['actions'] ?? []) as $action) {
                    DB::table('dunning_stages')->insertOrIgnore([
                        'id' => (string) Str::uuid(), 'organization_id' => $org, 'dunning_sequence_id' => $sequence, 'offset_days' => $offset, 'action' => $action,
                        'channels' => '{'.implode(',', array_intersect((array) ($stage['channels'] ?? ['email']), ['email', 'portal', 'whatsapp'])).'}',
                        'notification_template_code' => $stage['template'] ?? null,
                        'recipient_contact_role' => $stage['recipient_contact_role'] ?? 'billing', 'internal_copy' => $stage['internal_copy'] ?? 'none',
                        'send_time' => $stage['send_time'] ?? '09:00', 'non_business_day' => $stage['non_business_day'] ?? 'send_anyway',
                        'is_active' => (bool) ($stage['active'] ?? true),
                    ]);
                }
            }
        }

        return DB::table('dunning_stages')->where('dunning_sequence_id', $sequence)->where('is_active', true)->orderBy('offset_days')->get()->all();
    }
}
