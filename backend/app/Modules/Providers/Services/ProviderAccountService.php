<?php

declare(strict_types=1);

namespace App\Modules\Providers\Services;

use App\Modules\Providers\Models\ProviderAccount;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ProviderAccountService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(): array
    {
        $org = $this->organization->id();

        return [
            'provider_id' => ['required', 'uuid', Rule::exists('providers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'label' => ['required', 'string', 'max:255'],
            'external_account_id' => ['sometimes', 'nullable', 'string', 'max:255'],
            'owner' => ['sometimes', Rule::in(['company', 'customer'])],
            'customer_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'connector' => ['sometimes', 'nullable', 'string', 'max:100'],
            'connector_enabled' => ['sometimes', 'boolean'],
            'write_enabled' => ['sometimes', 'boolean'],
            'renewal_date' => ['sometimes', 'nullable', 'date'],
            'cost_minor' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'cost_currency' => ['sometimes', 'nullable', 'regex:/^[A-Z]{3}$/'],
            'billing_cycle' => ['sometimes', 'nullable', 'string', 'max:100'],
            'status' => ['sometimes', Rule::in(['active', 'suspended', 'closed'])],
            'custom' => ['sometimes', 'array'],
        ];
    }

    public function updateRules(): array
    {
        $rules = $this->rules();
        foreach ($rules as $field => $fieldRules) {
            if ($field !== 'provider_id' && $field !== 'label') {
                $rules[$field] = array_values(array_filter($fieldRules, fn ($rule) => $rule !== 'required'));
            }
        }

        return ['version' => ['required', 'integer'], 'provider_id' => array_values(array_filter($rules['provider_id'], fn ($rule) => $rule !== 'required')), 'label' => ['sometimes', 'string', 'max:255']] + array_diff_key($rules, ['provider_id' => true, 'label' => true]);
    }

    public function create(array $data): ProviderAccount
    {
        return DB::transaction(function () use ($data): ProviderAccount {
            $account = new ProviderAccount;
            $account->forceFill(Arr::only($data, $account->getFillable()))->save();
            $this->audit->record('provider_account.created', 'provider_account', $account->id, null, $account->refresh()->attributesToArray());

            return $account;
        });
    }

    public function update(ProviderAccount $account, array $data): ProviderAccount
    {
        return DB::transaction(function () use ($account, $data): ProviderAccount {
            VersionGuard::check($account, $data['version']);
            $before = $account->attributesToArray();
            $account->forceFill(Arr::only($data, $account->getFillable()))->save();
            $this->audit->record('provider_account.updated', 'provider_account', $account->id, $before, $account->refresh()->attributesToArray());

            return $account;
        });
    }

    public function delete(ProviderAccount $account, int $version): void
    {
        DB::transaction(function () use ($account, $version): void {
            VersionGuard::check($account, $version);
            $before = $account->attributesToArray();
            $account->delete();
            $this->audit->record('provider_account.deleted', 'provider_account', $account->id, $before, null);
        });
    }
}
