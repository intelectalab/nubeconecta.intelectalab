<?php

declare(strict_types=1);

namespace App\Modules\Services\Listeners;

use App\Modules\Billing\Events\InvoicePaid;
use App\Modules\Services\Models\Service;
use App\Shared\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/**
 * InvoicePaid → "renueva servicios" (docs/03 §3): por cada línea `service` con
 * suscripción, el vencimiento comercial del servicio avanza al día siguiente
 * del periodo pagado (nunca retrocede). Así el panel y el portal muestran
 * hasta cuándo está pagado.
 */
final class AdvanceCommercialDueDate
{
    public function __construct(private readonly AuditLogger $audit) {}

    public function handle(InvoicePaid $event): void
    {
        $lines = DB::table('invoice_items')->where('invoice_id', $event->invoiceId)->where('kind', 'service')
            ->whereNotNull('subscription_id')->whereNotNull('service_id')->whereNotNull('period_end')->get(['service_id', 'period_end']);
        foreach ($lines as $line) {
            $paidUntil = now()->parse((string) $line->period_end)->addDay()->toDateString();
            DB::transaction(function () use ($line, $paidUntil, $event): void {
                $service = Service::query()->lockForUpdate()->find($line->service_id);
                if ($service === null || ($service->commercial_due_date !== null && $service->commercial_due_date->toDateString() >= $paidUntil)) {
                    return;
                }
                $before = $service->only(['commercial_due_date']);
                $service->forceFill(['commercial_due_date' => $paidUntil])->save();
                $this->audit->record('service.renewed', 'service', $service->id, $before, $service->only(['commercial_due_date']), ['invoice_id' => $event->invoiceId], $service->customer_id);
            });
        }
    }
}
