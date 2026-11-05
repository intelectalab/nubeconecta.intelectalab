<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Inventory\Models\HostingNode;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class HostingNodeService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $required = $updating ? 'sometimes' : 'required'; $org = $this->organization->id();
        $unique = Rule::unique('hosting_nodes', 'resource_id'); if ($updating) $unique->ignore(request()->route('id'));
        return ['resource_id' => [$required, 'uuid', Rule::exists('resources', 'id')->where('organization_id', $org)->where('type', 'hosting_node')->whereNull('deleted_at'), $unique], 'kind' => [$required, Rule::in(['reseller', 'own_vps'])], 'server_id' => ['nullable', 'uuid', 'required_if:kind,own_vps', Rule::exists('servers', 'id')->where('organization_id', $org)], 'panel' => ['sometimes', Rule::in(['whm', 'plesk', 'other'])], 'hostname' => [$required, 'string', 'max:255'], 'ip' => ['sometimes', 'nullable', 'ip'], 'disk_quota_mb' => ['sometimes', 'nullable', 'integer', 'min:0'], 'disk_used_mb' => ['sometimes', 'nullable', 'integer', 'min:0'], 'accounts_limit' => ['sometimes', 'nullable', 'integer', 'min:0'], 'accounts_used' => ['sometimes', 'nullable', 'integer', 'min:0'], 'status' => ['sometimes', Rule::in(['active', 'migrating_out', 'retired'])], 'accepts_new_accounts' => ['sometimes', 'boolean'], 'capacity_thresholds' => ['sometimes', 'nullable', 'array'], 'cpanel_license_tier' => ['sometimes', 'nullable', 'string']];
    }
    public function create(array $data): HostingNode
    {
        return DB::transaction(function () use ($data): HostingNode { $model = new HostingNode; $model->forceFill(['status' => 'active'] + $this->editableData($data))->save(); $this->audit->record('hosting_node.created', 'hosting_node', $model->id, null, $model->refresh()->attributesToArray()); return $model; });
    }
    public function update(HostingNode $node, array $data): HostingNode
    {
        return DB::transaction(function () use ($node, $data): HostingNode { $node = HostingNode::query()->lockForUpdate()->findOrFail($node->id); VersionGuard::check($node, (int) $data['version']); $before = $node->attributesToArray(); $node->forceFill($this->editableData($data))->save(); $this->audit->record('hosting_node.updated', 'hosting_node', $node->id, $before, $node->refresh()->attributesToArray()); return $node; });
    }
    public function delete(HostingNode $node, int $version): void
    {
        DB::transaction(function () use ($node, $version): void { $node = HostingNode::query()->lockForUpdate()->findOrFail($node->id); VersionGuard::check($node, $version); $before = $node->attributesToArray(); $node->delete(); $this->audit->record('hosting_node.deleted', 'hosting_node', $node->id, $before, ['deleted' => true]); });
    }
    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['resource_id', 'kind', 'server_id', 'panel', 'hostname', 'ip', 'disk_quota_mb', 'disk_used_mb', 'accounts_limit', 'accounts_used', 'status', 'accepts_new_accounts', 'capacity_thresholds', 'cpanel_license_tier'])); }
}
