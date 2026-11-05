<?php

declare(strict_types=1);

namespace App\Modules\Providers\Services;

use App\Modules\Providers\Models\Provider;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ProviderService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(?Provider $provider = null): array
    {
        $org = $this->organization->id();

        return [
            'code' => [$provider ? 'sometimes' : 'required', 'string', 'max:60', Rule::unique('providers', 'code')->where('organization_id', $org)->ignore($provider?->id)],
            'name' => [$provider ? 'sometimes' : 'required', 'string', 'max:255'],
            'type' => [$provider ? 'sometimes' : 'required', Rule::in(Provider::TYPES)],
            'origin' => ['sometimes', Rule::in(['company', 'customer'])],
            'portal_url' => ['sometimes', 'nullable', 'url', 'max:2048'],
            'cost_currency' => ['sometimes', 'regex:/^[A-Z]{3}$/'],
            'connector' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in(['active', 'inactive'])],
            'notes_internal' => ['sometimes', 'nullable', 'string'],
            'sla_notes' => ['sometimes', 'nullable', 'string'],
            'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'custom' => ['sometimes', 'array'],
        ];
    }

    public function updateRules(Provider $provider): array
    {
        return ['version' => ['required', 'integer']] + $this->rules($provider);
    }

    public function create(array $data): Provider
    {
        return DB::transaction(function () use ($data): Provider {
            $provider = new Provider;
            $provider->forceFill(Arr::only($data, $provider->getFillable()))->save();
            $this->audit->record('provider.created', 'provider', $provider->id, null, $provider->refresh()->attributesToArray());

            return $provider;
        });
    }

    public function update(Provider $provider, array $data): Provider
    {
        return DB::transaction(function () use ($provider, $data): Provider {
            VersionGuard::check($provider, $data['version']);
            $before = $provider->attributesToArray();
            $provider->forceFill(Arr::only($data, $provider->getFillable()))->save();
            $this->audit->record('provider.updated', 'provider', $provider->id, $before, $provider->refresh()->attributesToArray());

            return $provider;
        });
    }

    public function delete(Provider $provider, int $version): void
    {
        DB::transaction(function () use ($provider, $version): void {
            VersionGuard::check($provider, $version);
            $before = $provider->attributesToArray();
            $provider->delete();
            $this->audit->record('provider.deleted', 'provider', $provider->id, $before, null);
        });
    }
}
