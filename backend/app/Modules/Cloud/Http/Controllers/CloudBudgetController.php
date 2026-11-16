<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Http\Controllers;

use App\Modules\Cloud\Http\Resources\CloudBudgetResource;
use App\Modules\Cloud\Models\CloudBudget;
use App\Modules\Cloud\Services\CloudService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

final class CloudBudgetController
{
    private const RELATIONS = ['project:id,name,customer_id,cloud_account_id'];

    public function __construct(private readonly CloudService $cloud) {}

    public function index(Request $request): JsonResponse
    {
        $query = CloudBudget::query()->with(self::RELATIONS);
        $project = $request->query('cloud_project_id');
        if (is_string($project) && Str::isUuid($project)) { $query->where('cloud_project_id', $project); }
        $customer = $request->query('customer_id');
        if (is_string($customer) && Str::isUuid($customer)) { $query->whereHas('project', fn (Builder $p) => $p->where('customer_id', $customer)); }
        $month = $request->query('period_month');
        if (is_string($month) && preg_match('/\A\d{4}-(0[1-9]|1[0-2])\z/', $month) === 1) { $query->where('period_month', $month.'-01'); }
        return CursorPagination::respond($query, $request, ['created_at', 'period_month', 'amount_minor', 'actual_minor'], CloudBudgetResource::class, '-period_month');
    }

    public function store(Request $request): JsonResponse
    {
        $budget = $this->cloud->createBudget($request->validate($this->cloud->budgetRules(null)));
        return (new CloudBudgetResource($budget))->response()->setStatusCode(201);
    }

    public function show(string $id): CloudBudgetResource
    {
        return new CloudBudgetResource(CloudBudget::query()->with(self::RELATIONS)->findOrFail($id));
    }

    public function update(Request $request, string $id): CloudBudgetResource
    {
        $budget = CloudBudget::query()->findOrFail($id);
        return new CloudBudgetResource($this->cloud->updateBudget($budget, $request->validate($this->cloud->budgetRules($budget))));
    }

    public function destroy(string $id): JsonResponse
    {
        $this->cloud->deleteBudget(CloudBudget::query()->findOrFail($id));
        return response()->json(null, 204);
    }
}
