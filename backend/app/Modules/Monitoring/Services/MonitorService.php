<?php

declare(strict_types=1);

namespace App\Modules\Monitoring\Services;

use App\Modules\Monitoring\Models\Monitor;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class MonitorService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }

    private function editableRules(bool $updating): array
    {
        $org = $this->organization->id();
        $uuidExists = static fn (string $table) => ['sometimes', 'nullable', 'uuid', Rule::exists($table, 'id')->where('organization_id', $org)];
        $resource = $uuidExists('resources');
        if (! DB::getSchemaBuilder()->hasTable('resources')) $resource = ['sometimes', 'nullable', 'uuid'];
        $component = $uuidExists('project_components');
        if (! DB::getSchemaBuilder()->hasTable('project_components')) $component = ['sometimes', 'nullable', 'uuid'];

        return [
            'name' => [$updating ? 'sometimes' : 'required', 'string', 'max:255'],
            'type' => [$updating ? 'sometimes' : 'required', Rule::in(Monitor::TYPES)],
            'target' => [$updating ? 'sometimes' : 'required', 'string', 'max:2048'],
            'interval_seconds' => [$updating ? 'sometimes' : 'required', 'integer', 'min:30'],
            'resource_id' => $resource, 'project_component_id' => $component,
            'service_id' => $uuidExists('services'),
            'is_active' => ['sometimes', 'boolean'],
            'authorized_by' => ['sometimes', 'nullable', 'uuid', Rule::exists('users', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
        ];
    }

    public function create(array $data): Monitor
    {
        return DB::transaction(function () use ($data): Monitor {
            $monitor = new Monitor;
            $monitor->forceFill(['status' => 'unknown', 'is_active' => true] + $this->editableData($data))->save();
            $this->audit->record('monitor.created', 'monitor', $monitor->id, null, $monitor->refresh()->attributesToArray());
            return $monitor;
        });
    }

    public function update(Monitor $monitor, array $data): Monitor
    {
        return $this->mutate($monitor, $data, 'monitor.updated', fn (Monitor $m) => $m->forceFill($this->editableData($data))->save());
    }

    public function setActive(Monitor $monitor, bool $active, int $version): Monitor
    {
        return $this->mutate($monitor, ['version' => $version], $active ? 'monitor.activated' : 'monitor.paused', function (Monitor $m) use ($active) { $m->forceFill(['is_active' => $active])->save(); });
    }

    private function mutate(Monitor $monitor, array $data, string $event, callable $change): Monitor
    {
        return DB::transaction(function () use ($monitor, $data, $event, $change): Monitor {
            $monitor = Monitor::query()->lockForUpdate()->findOrFail($monitor->id);
            VersionGuard::check($monitor, $data['version']);
            $before = $monitor->attributesToArray(); $change($monitor);
            $this->audit->record($event, 'monitor', $monitor->id, $before, $monitor->refresh()->attributesToArray());
            return $monitor;
        });
    }

    public function delete(Monitor $monitor, int $version): void
    {
        DB::transaction(function () use ($monitor, $version): void {
            $monitor = Monitor::query()->lockForUpdate()->findOrFail($monitor->id); VersionGuard::check($monitor, $version);
            $before = $monitor->attributesToArray(); $monitor->delete();
            $this->audit->record('monitor.deleted', 'monitor', $monitor->id, $before, ['deleted' => true]);
        });
    }

    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['name', 'type', 'target', 'interval_seconds', 'resource_id', 'project_component_id', 'service_id', 'is_active', 'authorized_by'])); }
}
