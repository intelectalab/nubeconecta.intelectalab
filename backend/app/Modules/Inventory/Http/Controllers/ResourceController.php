<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Http\Controllers;

use App\Modules\Inventory\Http\Resources\ResourceResource;
use App\Modules\Inventory\Models\Resource;
use App\Modules\Inventory\Services\ResourceService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class ResourceController
{
    public function __construct(private readonly ResourceService $resources) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.type' => ['sometimes', Rule::in(Resource::TYPES)], 'filter.status' => ['sometimes', Rule::in(Resource::STATUSES)], 'filter.provider_account_id' => ['sometimes', 'uuid'], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = Resource::query()->with('providerAccount:id,label');
        foreach (['type', 'status', 'provider_account_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', '')); if ($q !== '') $query->where(fn (Builder $w) => $w->where('name', 'ilike', "%$q%")->orWhere('external_id', 'ilike', "%$q%"));
        return CursorPagination::respond($query, $request, ['created_at', 'name', 'type', 'status'], ResourceResource::class);
    }
    public function store(Request $request): JsonResponse { $model = $this->resources->create($request->validate($this->resources->rules())); return (new ResourceResource($model->load('providerAccount:id,label')))->response()->setStatusCode(201); }
    public function show(string $id): ResourceResource { return new ResourceResource(Resource::query()->with('providerAccount:id,label')->findOrFail($id)); }
    public function update(Request $request, string $id): ResourceResource { $model = $this->resources->update(Resource::query()->findOrFail($id), $request->validate($this->resources->updateRules())); return new ResourceResource($model->load('providerAccount:id,label')); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->resources->delete(Resource::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
