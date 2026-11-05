<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Controllers;

use App\Modules\Inventory\Http\Resources\HostingNodeResource;
use App\Modules\Inventory\Models\HostingNode;
use App\Modules\Inventory\Services\HostingNodeService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class HostingNodeController
{
    public function __construct(private readonly HostingNodeService $nodes) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.kind' => ['sometimes', Rule::in(['reseller', 'own_vps'])], 'filter.status' => ['sometimes', Rule::in(['active', 'migrating_out', 'retired'])], 'filter.panel' => ['sometimes', Rule::in(['whm', 'plesk', 'other'])], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = HostingNode::query()->with(['resource', 'server']); foreach (['kind', 'status', 'panel'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', '')); if ($q !== '') $query->where(fn (Builder $w) => $w->where('hostname', 'ilike', "%$q%"));
        return CursorPagination::respond($query, $request, ['created_at', 'hostname', 'kind', 'status'], HostingNodeResource::class);
    }
    public function store(Request $request): JsonResponse { $model = $this->nodes->create($request->validate($this->nodes->rules())); return (new HostingNodeResource($model->load(['resource', 'server'])))->response()->setStatusCode(201); }
    public function show(string $id): HostingNodeResource { return new HostingNodeResource(HostingNode::query()->with(['resource', 'server'])->findOrFail($id)); }
    public function update(Request $request, string $id): HostingNodeResource { $model = $this->nodes->update(HostingNode::query()->findOrFail($id), $request->validate($this->nodes->updateRules())); return new HostingNodeResource($model->load(['resource', 'server'])); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->nodes->delete(HostingNode::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
