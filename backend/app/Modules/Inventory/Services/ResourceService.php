<?php

declare(strict_types=1);

namespace App\Modules\Inventory\Services;

use App\Modules\Inventory\Models\Resource;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ResourceService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $required = $updating ? 'sometimes' : 'required';
        return [
            'type' => [$required, Rule::in(Resource::TYPES)], 'name' => [$required, 'string', 'max:255'],
            'provider_account_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('provider_accounts', 'id')->where('organization_id', $this->organization->id())],
            'external_id' => ['sometimes', 'nullable', 'string'], 'status' => ['sometimes', Rule::in(['active', 'suspended', 'stopped', 'terminated'])],
            'specs' => ['sometimes', 'array'], 'cost_minor' => ['nullable', 'integer', 'min:0', 'required_with:cost_currency'],
            'cost_currency' => ['nullable', 'regex:/^[A-Z]{3}$/', 'required_with:cost_minor'],
            'renewal_date' => ['sometimes', 'nullable', 'date'], 'sync_mode' => ['sometimes', Rule::in(['api', 'manual'])], 'custom' => ['sometimes', 'array'],
        ];
    }
    public function create(array $data): Resource
    {
        return DB::transaction(function () use ($data): Resource {
            $resource = new Resource;
            $resource->forceFill(['status' => 'active', 'sync_mode' => 'manual'] + $this->editableData($data))->save();
            $this->audit->record('resource.created', 'resource', $resource->id, null, $resource->refresh()->attributesToArray());
            return $resource;
        });
    }
    public function update(Resource $resource, array $data): Resource
    {
        return DB::transaction(function () use ($resource, $data): Resource {
            $resource = Resource::query()->lockForUpdate()->findOrFail($resource->id);
            VersionGuard::check($resource, (int) $data['version']);
            $before = $resource->attributesToArray();
            $resource->forceFill($this->editableData($data))->save();
            $this->audit->record('resource.updated', 'resource', $resource->id, $before, $resource->refresh()->attributesToArray());
            return $resource;
        });
    }
    public function delete(Resource $resource, int $version): void
    {
        DB::transaction(function () use ($resource, $version): void {
            $resource = Resource::query()->lockForUpdate()->findOrFail($resource->id); VersionGuard::check($resource, $version);
            $before = $resource->attributesToArray(); $resource->delete();
            $this->audit->record('resource.deleted', 'resource', $resource->id, $before, ['deleted' => true]);
        });
    }
    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['type', 'provider_account_id', 'external_id', 'name', 'status', 'specs', 'cost_minor', 'cost_currency', 'renewal_date', 'sync_mode', 'custom'])); }
}
