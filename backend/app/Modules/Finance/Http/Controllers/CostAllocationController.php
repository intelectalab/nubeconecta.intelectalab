<?php

declare(strict_types=1);

namespace App\Modules\Finance\Http\Controllers;

use App\Modules\Finance\Http\Resources\CostAllocationResource;
use App\Modules\Finance\Models\CostAllocation;
use App\Modules\Finance\Services\CostAllocationService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

final class CostAllocationController
{
    public function __construct(private readonly CostAllocationService $allocations) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.cost_id' => ['required_without:filter.service_id', 'uuid'], 'filter.service_id' => ['required_without:filter.cost_id', 'uuid']]);
        $query = CostAllocation::query()->with('service');
        foreach (['cost_id', 'service_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        return CursorPagination::respond($query, $request, ['created_at', 'amount_minor'], CostAllocationResource::class);
    }
    public function store(Request $request): JsonResponse { $allocation = $this->allocations->create($request->validate($this->allocations->rules())); return (new CostAllocationResource($allocation->load('service')))->response()->setStatusCode(201); }
    public function show(string $id): CostAllocationResource { return new CostAllocationResource(CostAllocation::query()->with('service')->findOrFail($id)); }
    public function update(Request $request, string $id): CostAllocationResource { $allocation = $this->allocations->update(CostAllocation::query()->findOrFail($id), $request->validate($this->allocations->updateRules())); return new CostAllocationResource($allocation->load('service')); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->allocations->delete(CostAllocation::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
