<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers;

use App\Modules\Monitoring\Http\Resources\IncidentResource;
use App\Modules\Monitoring\Models\Incident;
use App\Modules\Monitoring\Services\IncidentService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class IncidentController
{
    public function __construct(private readonly IncidentService $incidents) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.status' => ['sometimes', Rule::in(Incident::STATUSES)], 'filter.severity' => ['sometimes', Rule::in(Incident::SEVERITIES)], 'filter.kind' => ['sometimes', Rule::in(Incident::KINDS)], 'filter.owner_id' => ['sometimes', 'nullable', 'uuid'], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = Incident::query()->with('owner:id,name');
        foreach (['status', 'severity', 'kind', 'owner_id'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') $query->where(fn (Builder $w) => $w->where('number', 'ilike', "%$q%")->orWhere('title', 'ilike', "%$q%"));
        return CursorPagination::respond($query, $request, ['created_at', 'number', 'title', 'started_at', 'status', 'severity'], IncidentResource::class);
    }
    public function store(Request $request): JsonResponse { $i = $this->incidents->create($request->validate($this->incidents->rules())); return (new IncidentResource($i->load('owner:id,name')))->response()->setStatusCode(201); }
    public function show(string $id): IncidentResource { return new IncidentResource(Incident::query()->with('owner:id,name')->findOrFail($id)); }
    public function update(Request $request, string $id): IncidentResource { $i = $this->incidents->update(Incident::query()->findOrFail($id), $request->validate($this->incidents->updateRules())); return new IncidentResource($i->load('owner:id,name')); }
    public function changeStatus(Request $request, string $id): IncidentResource { $data = $request->validate(['status' => ['required', Rule::in(Incident::STATUSES)], 'version' => ['required', 'integer']]); $i = $this->incidents->changeStatus(Incident::query()->findOrFail($id), $data['status'], (int) $data['version']); return new IncidentResource($i->load('owner:id,name')); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->incidents->delete(Incident::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
