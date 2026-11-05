<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Controllers;

use App\Modules\Inventory\Http\Resources\HostingAccountResource;
use App\Modules\Inventory\Models\HostingAccount;
use App\Modules\Inventory\Services\HostingAccountService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class HostingAccountController
{
    public function __construct(private readonly HostingAccountService $accounts) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.hosting_node_id' => ['sometimes', 'uuid'], 'filter.status' => ['sometimes', Rule::in(['active', 'suspended', 'terminated', 'not_found'])], 'filter.service_id' => ['sometimes', 'uuid'], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = HostingAccount::query()->with(['hostingNode', 'service', 'customer']); foreach (['hosting_node_id', 'status', 'service_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', '')); if ($q !== '') $query->where(fn (Builder $w) => $w->where('username', 'ilike', "%$q%")->orWhere('primary_domain', 'ilike', "%$q%"));
        return CursorPagination::respond($query, $request, ['created_at', 'username', 'primary_domain', 'status'], HostingAccountResource::class);
    }
    public function store(Request $request): JsonResponse { $model = $this->accounts->create($request->validate($this->accounts->rules())); return (new HostingAccountResource($model->load(['hostingNode', 'service', 'customer'])))->response()->setStatusCode(201); }
    public function show(string $id): HostingAccountResource { return new HostingAccountResource(HostingAccount::query()->with(['hostingNode', 'service', 'customer'])->findOrFail($id)); }
    public function update(Request $request, string $id): HostingAccountResource { $model = $this->accounts->update(HostingAccount::query()->findOrFail($id), $request->validate($this->accounts->updateRules())); return new HostingAccountResource($model->load(['hostingNode', 'service', 'customer'])); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->accounts->delete(HostingAccount::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
