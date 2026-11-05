<?php

declare(strict_types=1);

namespace App\Modules\Work\Http\Controllers;

use App\Modules\Work\Http\Resources\TaskResource;
use App\Modules\Work\Models\Task;
use App\Modules\Work\Services\TaskService;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

final class TaskController
{
    public function __construct(private readonly TaskService $tasks) {}

    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'filter.status' => ['sometimes', Rule::in(Task::STATUSES)],
            'filter.priority' => ['sometimes', Rule::in(Task::PRIORITIES)],
            'filter.assignee_id' => ['sometimes', 'uuid'], 'filter.customer_id' => ['sometimes', 'uuid'],
            'filter.parent_id' => ['sometimes', 'nullable', 'uuid'], 'filter.root' => ['sometimes', 'boolean'],
            'q' => ['sometimes', 'nullable', 'string', 'max:100'],
        ]);
        $query = Task::query()->with(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label']);
        foreach (['status', 'priority', 'assignee_id', 'customer_id'] as $column) {
            $value = $request->input("filter.{$column}");
            if (is_string($value) && $value !== '') {
                $query->where($column, $value);
            }
        }
        if ($request->boolean('filter.root')) {
            $query->whereNull('parent_id');
        } elseif ($request->exists('filter.parent_id')) {
            $query->where('parent_id', $request->input('filter.parent_id'));
        }
        $q = trim((string) $request->query('q', ''));
        if ($q !== '') {
            $query->where(fn (Builder $w) => $w->where('title', 'ilike', "%{$q}%")->orWhere('number', 'ilike', "%{$q}%"));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'number', 'title', 'due_at', 'status', 'priority'], TaskResource::class);
    }

    public function store(Request $request): JsonResponse
    {
        $task = $this->tasks->create($request->validate($this->tasks->rules()), $request->header('Idempotency-Key'));

        return (new TaskResource($task->load(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label'])))->response()->setStatusCode(201);
    }

    public function show(string $id): TaskResource
    {
        return new TaskResource(Task::query()->with(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label', 'subtasks'])->findOrFail($id));
    }

    public function update(Request $request, string $id): TaskResource
    {
        $task = $this->tasks->update(Task::query()->findOrFail($id), $request->validate($this->tasks->updateRules()));

        return new TaskResource($task->load(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label']));
    }

    public function changeStatus(Request $request, string $id): TaskResource
    {
        $data = $request->validate(['status' => ['required', Rule::in(Task::STATUSES)], 'version' => ['required', 'integer']]);
        $task = $this->tasks->changeStatus(Task::query()->findOrFail($id), $data['status'], (int) $data['version']);

        return new TaskResource($task->load(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label']));
    }

    public function assign(Request $request, string $id): TaskResource
    {
        $data = $request->validate([
            'assignee_id' => ['present', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', app(CurrentOrganization::class)->id())->whereNull('deleted_at')],
            'version' => ['required', 'integer'],
        ]);
        $task = $this->tasks->assign(Task::query()->findOrFail($id), $data['assignee_id'], (int) $data['version']);

        return new TaskResource($task->load(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label']));
    }

    public function approve(Request $request, string $id): TaskResource
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $task = $this->tasks->approve(Task::query()->findOrFail($id), (int) $data['version']);

        return new TaskResource($task->load(['assignee:id,name', 'customer:id,code,legal_name,trade_name', 'service:id,label']));
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['version' => ['required', 'integer']]);
        $this->tasks->delete(Task::query()->findOrFail($id), (int) $data['version']);

        return response()->json(null, 204);
    }
}
