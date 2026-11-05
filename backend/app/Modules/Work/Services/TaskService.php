<?php

declare(strict_types=1);

namespace App\Modules\Work\Services;

use App\Models\User;
use App\Modules\Work\Models\Task;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class TaskService
{
    /** @var array<string, list<string>> */
    public const TRANSITIONS = [
        'todo' => ['in_progress', 'blocked', 'cancelled'],
        'in_progress' => ['blocked', 'in_review', 'done', 'todo', 'cancelled'],
        'blocked' => ['in_progress', 'cancelled'],
        'in_review' => ['in_progress', 'done', 'cancelled'],
        'done' => ['in_progress'],
        'cancelled' => [],
    ];

    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(): array
    {
        return $this->editableRules(false);
    }

    public function updateRules(): array
    {
        return ['version' => ['required', 'integer']] + $this->editableRules(true);
    }

    /** @return array<string, list<mixed>> */
    private function editableRules(bool $updating): array
    {
        $org = $this->organization->id();

        return [
            'title' => [$updating ? 'sometimes' : 'required', 'string', 'max:500'],
            'description' => ['sometimes', 'nullable', 'string'],
            'priority' => ['sometimes', Rule::in(Task::PRIORITIES)],
            'assignee_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'due_at' => ['sometimes', 'nullable', 'date'],
            'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'service_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'is_billable' => ['sometimes', 'boolean'],
            'parent_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('tasks', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'requires_approval' => ['sometimes', 'boolean'],
            'is_sensitive' => ['sometimes', 'boolean'],
            'custom' => ['sometimes', 'array'],
        ];
    }

    /** @param array<string, mixed> $data */
    public function create(array $data, ?string $idempotencyKey = null): Task
    {
        return DB::transaction(function () use ($data): Task {
            $task = new Task;
            $task->forceFill($this->editableData($data) + [
                'number' => $this->nextNumber(), 'status' => 'todo', 'source_type' => 'manual', 'source_id' => null,
            ])->save();
            $this->audit->record('task.created', 'task', $task->id, null, $task->refresh()->attributesToArray(), [], $task->customer_id);

            return $task;
        });
    }

    /** @param array<string, mixed> $data */
    public function update(Task $task, array $data): Task
    {
        return DB::transaction(function () use ($task, $data): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            VersionGuard::check($task, $data['version']);
            $before = $task->attributesToArray();
            $task->forceFill($this->editableData($data))->save();
            $this->audit->record('task.updated', 'task', $task->id, $before, $task->refresh()->attributesToArray(), [], $task->customer_id);

            return $task;
        });
    }

    public function changeStatus(Task $task, string $nextStatus, int $version): Task
    {
        return DB::transaction(function () use ($task, $nextStatus, $version): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            VersionGuard::check($task, $version);
            if (! in_array($nextStatus, self::TRANSITIONS[$task->status] ?? [], true)) {
                throw ProblemException::validation(['status' => ["No se permite la transición {$task->status} → {$nextStatus}."]]);
            }
            if ($nextStatus === 'done' && $task->requires_approval && $task->approved_at === null) {
                throw ProblemException::validation(['status' => ['La tarea requiere aprobación antes de completarse.']]);
            }
            $before = $task->attributesToArray();
            $task->forceFill(['status' => $nextStatus, 'completed_at' => $nextStatus === 'done' ? now() : null])->save();
            $this->audit->record('task.status_changed', 'task', $task->id, $before, $task->refresh()->attributesToArray(), [], $task->customer_id);

            return $task;
        });
    }

    public function assign(Task $task, ?string $assigneeId, int $version): Task
    {
        return DB::transaction(function () use ($task, $assigneeId, $version): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            VersionGuard::check($task, $version);
            if ($assigneeId !== null) {
                User::query()->findOrFail($assigneeId);
            }
            $before = $task->attributesToArray();
            $task->forceFill(['assignee_id' => $assigneeId])->save();
            $this->audit->record('task.assigned', 'task', $task->id, $before, $task->refresh()->attributesToArray(), [], $task->customer_id);

            return $task;
        });
    }

    public function approve(Task $task, int $version): Task
    {
        return DB::transaction(function () use ($task, $version): Task {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            VersionGuard::check($task, $version);
            if (! $task->requires_approval || $task->approved_at !== null) {
                throw ProblemException::validation(['requires_approval' => ['La tarea no requiere aprobación o ya fue aprobada.']]);
            }
            $before = $task->attributesToArray();
            $task->forceFill(['approved_by' => Auth::id(), 'approved_at' => now()])->save();
            $this->audit->record('task.approved', 'task', $task->id, $before, $task->refresh()->attributesToArray(), [], $task->customer_id);

            return $task;
        });
    }

    public function delete(Task $task, int $version): void
    {
        DB::transaction(function () use ($task, $version): void {
            $task = Task::query()->lockForUpdate()->findOrFail($task->id);
            VersionGuard::check($task, $version);
            $before = $task->attributesToArray();
            $task->delete();
            $this->audit->record('task.deleted', 'task', $task->id, $before, ['deleted_at' => $task->deleted_at?->toIso8601String()], [], $task->customer_id);
        });
    }

    /** @param array<string, mixed> $data @return array<string, mixed> */
    private function editableData(array $data): array
    {
        return array_intersect_key($data, array_flip(['title', 'description', 'priority', 'assignee_id', 'due_at', 'customer_id', 'service_id', 'is_billable', 'parent_id', 'requires_approval', 'is_sensitive', 'custom']));
    }

    private function nextNumber(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'task', 'prefix' => 'TAR', 'padding' => 6, 'next_value' => 1]);

        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'task'])->code;
    }
}
