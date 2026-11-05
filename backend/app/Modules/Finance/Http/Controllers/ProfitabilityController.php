<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Controllers;

use App\Modules\Finance\Models\CostAllocation;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

final class ProfitabilityController
{
    public function __construct(private readonly CurrentOrganization $organization) {}
    public function __invoke(Request $request): JsonResponse
    {
        $data = $request->validate(['period_month' => ['required', 'date_format:Y-m-d']]);
        abort_unless(substr($data['period_month'], 8, 2) === '01', 422);
        $org = $this->organization->id();
        // Reporte solo de costos asignados: no incorpora ingresos ni datos de billing.
        $rows = CostAllocation::query()->where('cost_allocations.organization_id', $org)
            ->join('costs', function ($join) use ($org): void { $join->on('costs.id', '=', 'cost_allocations.cost_id')->where('costs.organization_id', '=', $org); })
            ->join('services', function ($join) use ($org): void { $join->on('services.id', '=', 'cost_allocations.service_id')->where('services.organization_id', '=', $org); })
            ->whereDate('costs.period_month', $data['period_month'])
            ->select('cost_allocations.service_id', 'services.label as service_name', 'cost_allocations.cost_currency', DB::raw('SUM(cost_allocations.amount_minor) as allocated_cost_minor'))
            ->groupBy('cost_allocations.service_id', 'services.label', 'cost_allocations.cost_currency')->orderBy('services.label')->get()
            ->map(fn ($row) => ['service_id' => $row->service_id, 'service_name' => $row->service_name, 'allocated_cost_minor' => (int) $row->allocated_cost_minor, 'cost_currency' => $row->cost_currency]);
        $totals = $rows->groupBy('cost_currency')->map(fn ($items, $currency) => ['cost_currency' => $currency, 'allocated_cost_minor' => $items->sum('allocated_cost_minor')])->values();
        return response()->json(['data' => $rows->values(), 'totals' => $totals]);
    }
}
