<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Inventory\Models\Server;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ServerService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $required = $updating ? 'sometimes' : 'required'; $org = $this->organization->id();
        $resource = Rule::exists('resources', 'id')->where('organization_id', $org)->where('type', 'server')->whereNull('deleted_at');
        $unique = Rule::unique('servers', 'resource_id');
        if ($updating) $unique->ignore(request()->route('id'));
        return ['resource_id' => [$required, 'uuid', $resource, $unique], 'hostname' => [$required, 'string', 'max:255'], 'os' => ['sometimes', 'nullable', 'string'], 'public_ip' => ['sometimes', 'nullable', 'ip'], 'private_ip' => ['sometimes', 'nullable', 'ip'], 'cpu' => ['sometimes', 'nullable', 'integer', 'min:1'], 'ram_mb' => ['sometimes', 'nullable', 'integer', 'min:1'], 'disk_gb' => ['sometimes', 'nullable', 'integer', 'min:1'], 'region' => ['sometimes', 'nullable', 'string'], 'tenancy' => ['sometimes', Rule::in(['dedicated', 'shared'])], 'custom' => ['sometimes', 'array']];
    }
    public function create(array $data): Server
    {
        return DB::transaction(function () use ($data): Server { $model = new Server; $model->forceFill($this->editableData($data))->save(); $this->audit->record('server.created', 'server', $model->id, null, $model->refresh()->attributesToArray()); return $model; });
    }
    public function update(Server $server, array $data): Server
    {
        return DB::transaction(function () use ($server, $data): Server { $server = Server::query()->lockForUpdate()->findOrFail($server->id); VersionGuard::check($server, (int) $data['version']); $before = $server->attributesToArray(); $server->forceFill($this->editableData($data))->save(); $this->audit->record('server.updated', 'server', $server->id, $before, $server->refresh()->attributesToArray()); return $server; });
    }
    public function delete(Server $server, int $version): void
    {
        DB::transaction(function () use ($server, $version): void { $server = Server::query()->lockForUpdate()->findOrFail($server->id); VersionGuard::check($server, $version); $before = $server->attributesToArray(); $server->delete(); $this->audit->record('server.deleted', 'server', $server->id, $before, ['deleted' => true]); });
    }
    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['resource_id', 'hostname', 'os', 'public_ip', 'private_ip', 'cpu', 'ram_mb', 'disk_gb', 'region', 'tenancy', 'custom'])); }
}
