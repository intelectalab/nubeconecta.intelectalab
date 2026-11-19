<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Services\Support\Cycle;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Costos demo (PEN) del mes actual, asignados a servicios con suscripciones
 * activas, para que el reporte Finanzas → Rentabilidad muestre ingreso, costo
 * y margen. Los costos se dimensionan como fracción del ingreso mensual de
 * cada servicio (uno en pérdida, para realismo).
 *
 * - Idempotente: si ya hay un costo demo del periodo (description 'DEMO · …'), no hace nada.
 * - Transaccional. Ejecutar: php artisan db:seed --class=DemoFinanceSeeder
 */
final class DemoFinanceSeeder extends Seeder
{
    public function run(): void
    {
        $org = (string) DB::table('organizations')->value('id');
        if ($org === '') {
            $this->command?->warn('No hay organización; se omite DemoFinanceSeeder.');

            return;
        }
        $period = Carbon::now()->startOfMonth()->toDateString();
        if (DB::table('costs')->where('organization_id', $org)->whereDate('period_month', $period)->where('description', 'like', 'DEMO · %')->exists()) {
            $this->command?->info('DemoFinanceSeeder: los costos demo del periodo ya existen, no se hace nada.');

            return;
        }

        $monthStart = Carbon::parse($period);
        $monthEnd = $monthStart->copy()->endOfMonth();

        // Ingreso mensual PEN por servicio (suscripciones activas del mes).
        $subs = DB::table('subscriptions')->where('organization_id', $org)
            ->where('currency', 'PEN')->whereIn('cycle', array_keys(Cycle::MONTHS))
            ->whereDate('starts_on', '<=', $monthEnd->toDateString())
            ->where(fn ($q) => $q->whereNull('ends_on')->orWhereDate('ends_on', '>=', $monthStart->toDateString()))
            ->get(['service_id', 'cycle', 'price_minor', 'quantity']);

        $revenue = [];
        foreach ($subs as $s) {
            $revenue[$s->service_id] = ($revenue[$s->service_id] ?? 0) + (int) round(((float) $s->price_minor * (float) $s->quantity) / Cycle::MONTHS[$s->cycle]);
        }
        $revenue = array_filter($revenue, static fn ($v) => $v > 0);
        if ($revenue === []) {
            $this->command?->warn('DemoFinanceSeeder: no hay suscripciones PEN activas; se omite.');

            return;
        }
        arsort($revenue);
        $services = array_keys($revenue); // todos los servicios con ingreso

        // Factores costo/ingreso ciclados: la mayoría rentables, algunos en pérdida (>1).
        $factors = [0.55, 0.62, 0.48, 1.18, 0.70, 0.58, 0.66, 1.12, 0.52, 0.72];
        $now = now();

        DB::transaction(function () use ($org, $period, $services, $revenue, $factors, $now): void {
            $i = 0;
            foreach ($services as $serviceId) {
                $amount = (int) round($revenue[$serviceId] * $factors[$i % count($factors)]);
                if ($amount <= 0) {
                    $i++;

                    continue;
                }
                $costId = (string) Str::uuid();
                DB::table('costs')->insert([
                    'id' => $costId, 'organization_id' => $org, 'kind' => 'provider_recurring',
                    'period_month' => $period, 'amount_minor' => $amount, 'cost_currency' => 'PEN',
                    'allocation_method' => 'manual', 'description' => 'DEMO · Costo de proveedor del servicio',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                DB::table('cost_allocations')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'cost_id' => $costId,
                    'service_id' => $serviceId, 'share_percent' => 100, 'amount_minor' => $amount, 'cost_currency' => 'PEN',
                    'basis' => '{}', 'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $i++;
            }
        });

        $this->command?->info('DemoFinanceSeeder: costos y asignaciones demo (PEN) creados para '.$period.'.');
    }
}
