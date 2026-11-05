<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Controllers;

use App\Modules\Finance\Http\Resources\CostResource;
use App\Modules\Finance\Models\Cost;
use App\Modules\Finance\Services\CostService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class CostController
{
    public function __construct(private readonly CostService $costs) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.kind' => ['sometimes', Rule::in(['provider_recurring', 'provider_one_time', 'license', 'payment_fee', 'other'])], 'filter.period_month' => ['sometimes', 'date'], 'filter.resource_id' => ['sometimes', 'uuid'], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = Cost::query()->with(['resource', 'providerAccount']);
        foreach (['kind', 'resource_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        if ($request->exists('filter.period_month')) $query->whereDate('period_month', substr((string) $request->input('filter.period_month'), 0, 7).'-01');
        $q = trim((string) $request->query('q', '')); if ($q !== '') $query->where('description', 'ilike', "%$q%");
        return CursorPagination::respond($query, $request, ['created_at', 'period_month', 'amount_minor'], CostResource::class);
    }
    public function store(Request $request): JsonResponse { $cost = $this->costs->create($request->validate($this->costs->rules())); return (new CostResource($cost->load(['resource', 'providerAccount'])))->response()->setStatusCode(201); }
    public function show(string $id): CostResource { return new CostResource(Cost::query()->with(['allocations.service', 'resource', 'providerAccount'])->findOrFail($id)); }
    public function update(Request $request, string $id): CostResource { $cost = $this->costs->update(Cost::query()->findOrFail($id), $request->validate($this->costs->updateRules())); return new CostResource($cost->load(['resource', 'providerAccount'])); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->costs->delete(Cost::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
