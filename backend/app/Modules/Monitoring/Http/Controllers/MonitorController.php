<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Http\Controllers;

use App\Modules\Monitoring\Http\Resources\MonitorResource;
use App\Modules\Monitoring\Models\Monitor;
use App\Modules\Monitoring\Services\MonitorService;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class MonitorController
{
    public function __construct(private readonly MonitorService $monitors) {}
    public function index(Request $request): JsonResponse
    {
        $request->validate(['filter.type' => ['sometimes', Rule::in(Monitor::TYPES)], 'filter.status' => ['sometimes', Rule::in(Monitor::STATUSES)], 'filter.is_active' => ['sometimes', 'boolean'], 'q' => ['sometimes', 'nullable', 'string', 'max:100']]);
        $query = Monitor::query()->with(['service:id,label', 'resource', 'authorizedBy:id,name']);
        foreach (['type', 'status', 'is_active'] as $column) if ($request->exists("filter.$column")) $query->where($column, $request->input("filter.$column"));
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') $query->where(fn (Builder $w) => $w->where('name', 'ilike', "%$q%")->orWhere('target', 'ilike', "%$q%"));
        return CursorPagination::respond($query, $request, ['created_at', 'name', 'type', 'status'], MonitorResource::class);
    }
    public function store(Request $request): JsonResponse { $m = $this->monitors->create($request->validate($this->monitors->rules())); return (new MonitorResource($m->load(['service:id,label', 'resource', 'authorizedBy:id,name'])))->response()->setStatusCode(201); }
    public function show(string $id): MonitorResource { return new MonitorResource(Monitor::query()->with(['service:id,label', 'resource', 'authorizedBy:id,name'])->findOrFail($id)); }
    public function update(Request $request, string $id): MonitorResource { $m = $this->monitors->update(Monitor::query()->findOrFail($id), $request->validate($this->monitors->updateRules())); return new MonitorResource($m->load(['service:id,label', 'resource', 'authorizedBy:id,name'])); }
    public function activate(Request $request, string $id): MonitorResource { return $this->setActive($request, $id, true); }
    public function pause(Request $request, string $id): MonitorResource { return $this->setActive($request, $id, false); }
    private function setActive(Request $request, string $id, bool $active): MonitorResource { $data = $request->validate(['version' => ['required', 'integer']]); $m = $this->monitors->setActive(Monitor::query()->findOrFail($id), $active, (int) $data['version']); return new MonitorResource($m->load(['service:id,label', 'resource', 'authorizedBy:id,name'])); }
    public function destroy(Request $request, string $id): JsonResponse { $data = $request->validate(['version' => ['required', 'integer']]); $this->monitors->delete(Monitor::query()->findOrFail($id), (int) $data['version']); return response()->json(null, 204); }
}
