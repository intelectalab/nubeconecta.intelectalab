<?php

declare(strict_types=1);

namespace App\Modules\Billing\Jobs;

use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Services\Support\Cycle;
use App\Shared\Settings\SettingsReader;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\DB;

/**
 * GenerateRenewalInvoices (M-BIL §9, RN-BIL-001/002): borrador por cada
 * suscripción `active` de servicio `active` cuya `next_invoice_date` cae dentro
 * de `billing.invoice_generation_days` (o el valor por ciclo de
 * `billing.invoice_generation_days_by_cycle`). Único mientras corre; cada
 * suscripción se bloquea y verifica dentro de su transacción.
 */
final class GenerateRenewalInvoices implements ShouldBeUnique, ShouldQueue
{
    use Dispatchable, Queueable;

    public int $uniqueFor = 3600;

    /** @return int borradores creados */
    public function handle(InvoiceService $invoices, SettingsReader $settings): int
    {
        $default = $settings->int('billing.invoice_generation_days', 30);
        $byCycle = (array) ($settings->get('billing.invoice_generation_days_by_cycle', []) ?? []);
        $max = max([$default, ...array_map('intval', array_values($byCycle))]);
        $today = now()->startOfDay();
        $created = 0;
        DB::table('subscriptions')->join('services', 'services.id', '=', 'subscriptions.service_id')
            ->where('subscriptions.status', 'active')->where('services.status', 'active')->whereNull('services.deleted_at')
            ->whereIn('subscriptions.cycle', array_keys(Cycle::MONTHS))
            ->where('subscriptions.next_invoice_date', '<=', $today->copy()->addDays($max)->toDateString())
            ->orderBy('subscriptions.next_invoice_date')->orderBy('subscriptions.id')
            ->select(['subscriptions.id', 'subscriptions.cycle', 'subscriptions.next_invoice_date'])
            ->chunk(200, function ($rows) use ($invoices, $byCycle, $default, $today, &$created): void {
                foreach ($rows as $row) {
                    $days = isset($byCycle[$row->cycle]) ? (int) $byCycle[$row->cycle] : $default;
                    if ($row->next_invoice_date > $today->copy()->addDays($days)->toDateString()) {
                        continue;
                    }
                    $invoice = $invoices->draftRenewal((string) $row->id);
                    if ($invoice !== null) {
                        $created++;
                        $invoices->autoIssue($invoice);
                    }
                }
            });

        return $created;
    }
}
