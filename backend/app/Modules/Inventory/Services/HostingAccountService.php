<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Inventory\Models\HostingAccount;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class HostingAccountService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $required = $updating ? 'sometimes' : 'required'; $org = $this->organization->id();
        $nodeId = request()->input('hosting_node_id');
        $id = request()->route('id');
        if ($updating && ! $nodeId) $nodeId = HostingAccount::query()->whereKey($id)->value('hosting_node_id');
        $unique = Rule::unique('hosting_accounts', 'username')->where('hosting_node_id', $nodeId);
        if ($updating) $unique->ignore($id);
        $resourceUnique = Rule::unique('hosting_accounts', 'resource_id');
        if ($updating) $resourceUnique->ignore($id);
        return ['hosting_node_id' => [$required, 'uuid', Rule::exists('hosting_nodes', 'id')->where('organization_id', $org)], 'resource_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('resources', 'id')->where('organization_id', $org)->where('type', 'hosting_account')->whereNull('deleted_at'), $resourceUnique], 'username' => [$required, 'string', 'max:255', $unique], 'primary_domain' => [$required, 'string', 'max:255'], 'disk_quota_mb' => ['sometimes', 'nullable', 'integer', 'min:0'], 'disk_used_mb' => ['sometimes', 'nullable', 'integer', 'min:0'], 'service_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)], 'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)], 'status' => ['sometimes', Rule::in(['active', 'suspended', 'terminated'])]];
    }
    public function create(array $data): HostingAccount
    {
        return DB::transaction(function () use ($data): HostingAccount { $model = new HostingAccount; $model->forceFill(['status' => 'active'] + $this->editableData($data))->save(); $this->audit->record('hosting_account.created', 'hosting_account', $model->id, null, $model->refresh()->attributesToArray()); return $model; });
    }
    public function update(HostingAccount $account, array $data): HostingAccount
    {
        return DB::transaction(function () use ($account, $data): HostingAccount { $account = HostingAccount::query()->lockForUpdate()->findOrFail($account->id); VersionGuard::check($account, (int) $data['version']); $before = $account->attributesToArray(); $account->forceFill($this->editableData($data))->save(); $this->audit->record('hosting_account.updated', 'hosting_account', $account->id, $before, $account->refresh()->attributesToArray()); return $account; });
    }
    public function delete(HostingAccount $account, int $version): void
    {
        DB::transaction(function () use ($account, $version): void { $account = HostingAccount::query()->lockForUpdate()->findOrFail($account->id); VersionGuard::check($account, $version); $before = $account->attributesToArray(); $account->delete(); $this->audit->record('hosting_account.deleted', 'hosting_account', $account->id, $before, ['deleted' => true]); });
    }
    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['hosting_node_id', 'resource_id', 'username', 'primary_domain', 'disk_quota_mb', 'disk_used_mb', 'service_id', 'customer_id', 'status'])); }
}
