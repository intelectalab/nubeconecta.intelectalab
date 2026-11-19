<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Controllers;

use App\Modules\Finance\Models\CostAllocation;
use App\Modules\Services\Support\Cycle;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Rentabilidad por servicio y mes: costo asignado frente a ingreso recurrente.
 *
 * - Costo: suma de cost_allocations del periodo, por servicio y moneda.
 * - Ingreso: suscripciones activas en el mes (por fechas starts_on/ends_on),
 *   precio normalizado a mensual (price_minor*quantity / meses del ciclo),
 *   por servicio y moneda. Misma base que el MRR del tablero.
 * - Margen: ingreso − costo, SOLO cuando ambos están en la misma moneda
 *   (no se inventa tipo de cambio). Una fila por combinación servicio+moneda.
 */
final class ProfitabilityController
{
    public function __construct(private readonly CurrentOrganization $organization) {}

    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['period_month' => ['required', 'date_format:Y-m-d']]);
        abort_unless(substr($data['period_month'], 8, 2) === '01', 422);
        $org = $this->organization->id();
        $monthStart = Carbon::parse($data['period_month'])->startOfDay();
        $monthEnd = $monthStart->copy()->endOfMonth();

        // --- Costo asignado por servicio y moneda ---
        $costRows = CostAllocation::query()->where('cost_allocations.organization_id', $org)
            ->join('costs', function ($join) use ($org): void { $join->on('costs.id', '=', 'cost_allocations.cost_id')->where('costs.organization_id', '=', $org); })
            ->join('services', function ($join) use ($org): void { $join->on('services.id', '=', 'cost_allocations.service_id')->where('services.organization_id', '=', $org); })
            ->whereDate('costs.period_month', $data['period_month'])
            ->select('cost_allocations.service_id', 'services.label as service_name', 'cost_allocations.cost_currency as currency', DB::raw('SUM(cost_allocations.amount_minor) as cost_minor'))
            ->groupBy('cost_allocations.service_id', 'services.label', 'cost_allocations.cost_currency')->get();

        // --- Ingreso recurrente mensualizado por servicio y moneda ---
        $subs = DB::table('subscriptions')->where('subscriptions.organization_id', $org)
            ->join('services', function ($join) use ($org): void { $join->on('services.id', '=', 'subscriptions.service_id')->where('services.organization_id', '=', $org); })
            ->whereIn('subscriptions.cycle', array_keys(Cycle::MONTHS))
            ->whereDate('subscriptions.starts_on', '<=', $monthEnd->toDateString())
            ->where(fn ($q) => $q->whereNull('subscriptions.ends_on')->orWhereDate('subscriptions.ends_on', '>=', $monthStart->toDateString()))
            ->get(['subscriptions.service_id', 'services.label as service_name', 'subscriptions.currency', 'subscriptions.cycle', 'subscriptions.price_minor', 'subscriptions.quantity']);

        // Acumular por clave servicio|moneda.
        $acc = [];
        $name = [];
        $key = static fn (string $sid, string $cur): string => $sid.'|'.$cur;
        foreach ($costRows as $r) {
            $k = $key($r->service_id, $r->currency);
            $acc[$k] ??= ['service_id' => $r->service_id, 'currency' => $r->currency, 'revenue_minor' => 0, 'allocated_cost_minor' => 0];
            $acc[$k]['allocated_cost_minor'] += (int) $r->cost_minor;
            $name[$r->service_id] = $r->service_name;
        }
        foreach ($subs as $s) {
            $k = $key($s->service_id, $s->currency);
            $acc[$k] ??= ['service_id' => $s->service_id, 'currency' => $s->currency, 'revenue_minor' => 0, 'allocated_cost_minor' => 0];
            $acc[$k]['revenue_minor'] += (int) round(((float) $s->price_minor * (float) $s->quantity) / Cycle::MONTHS[$s->cycle]);
            $name[$s->service_id] = $s->service_name;
        }

        $rows = [];
        foreach ($acc as $row) {
            $margin = $row['revenue_minor'] - $row['allocated_cost_minor'];
            $rows[] = [
                'service_id' => $row['service_id'],
                'service_name' => $name[$row['service_id']] ?? null,
                'currency' => $row['currency'],
                'revenue_minor' => $row['revenue_minor'],
                'allocated_cost_minor' => $row['allocated_cost_minor'],
                'margin_minor' => $margin,
                'margin_pct' => $row['revenue_minor'] > 0 ? round($margin / $row['revenue_minor'] * 100, 1) : null,
            ];
        }
        usort($rows, static fn ($a, $b) => [strtolower((string) $a['service_name']), $a['currency']] <=> [strtolower((string) $b['service_name']), $b['currency']]);

        $totals = [];
        foreach ($rows as $row) {
            $cur = $row['currency'];
            $totals[$cur] ??= ['currency' => $cur, 'revenue_minor' => 0, 'allocated_cost_minor' => 0];
            $totals[$cur]['revenue_minor'] += $row['revenue_minor'];
            $totals[$cur]['allocated_cost_minor'] += $row['allocated_cost_minor'];
        }
        $totals = array_map(static function (array $t): array {
            $t['margin_minor'] = $t['revenue_minor'] - $t['allocated_cost_minor'];
            $t['margin_pct'] = $t['revenue_minor'] > 0 ? round($t['margin_minor'] / $t['revenue_minor'] * 100, 1) : null;

            return $t;
        }, array_values($totals));

        return response()->json(['data' => $rows, 'totals' => $totals]);
    }
}
