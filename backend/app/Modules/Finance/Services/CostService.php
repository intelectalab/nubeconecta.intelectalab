<?php

declare(strict_types=1);

namespace App\Modules\Finance\Services;

use App\Modules\Finance\Models\Cost;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Organization\CurrentOrganization;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class CostService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $req = $updating ? 'sometimes' : 'required'; $org = $this->organization->id();
        return [
            'kind' => [$req, Rule::in(['provider_recurring', 'provider_one_time', 'license', 'payment_fee', 'other'])],
            'period_month' => [$req, 'date'], 'amount_minor' => [$req, 'integer', 'min:0'],
            'cost_currency' => [$req, 'regex:/^[A-Z]{3}$/'],
            'allocation_method' => ['sometimes', Rule::in(['resources', 'percentage', 'usage', 'manual', 'none'])],
            'resource_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('resources', 'id')->where('organization_id', $org)],
            'provider_account_id' => ['sometimes', 'nullable', 'uuid', Rule::exists('provider_accounts', 'id')->where('organization_id', $org)],
            'provider_bill_id' => ['sometimes', 'nullable', 'uuid'], 'payment_id' => ['sometimes', 'nullable', 'uuid'],
            'description' => ['sometimes', 'nullable', 'string'],
        ];
    }
    public function create(array $data): Cost
    {
        return DB::transaction(function () use ($data): Cost {
            $cost = new Cost; $cost->forceFill($this->editableData($data))->save();
            $this->audit->record('cost.created', 'cost', $cost->id, null, $cost->refresh()->attributesToArray()); return $cost;
        });
    }
    public function update(Cost $cost, array $data): Cost
    {
        return DB::transaction(function () use ($cost, $data): Cost {
            $cost = Cost::query()->lockForUpdate()->findOrFail($cost->id); VersionGuard::check($cost, $data['version']);
            $before = $cost->attributesToArray(); $cost->forceFill($this->editableData($data))->save();
            $this->audit->record('cost.updated', 'cost', $cost->id, $before, $cost->refresh()->attributesToArray()); return $cost;
        });
    }
    public function delete(Cost $cost, int $version): void
    {
        DB::transaction(function () use ($cost, $version): void {
            $cost = Cost::query()->lockForUpdate()->findOrFail($cost->id); VersionGuard::check($cost, $version);
            $before = $cost->attributesToArray(); $cost->delete(); $this->audit->record('cost.deleted', 'cost', $cost->id, $before, ['deleted' => true]);
        });
    }
    private function editableData(array $data): array
    {
        $allowed = array_intersect_key($data, array_flip(['kind', 'resource_id', 'provider_account_id', 'provider_bill_id', 'payment_id', 'period_month', 'amount_minor', 'cost_currency', 'allocation_method', 'description']));
        if (isset($allowed['period_month'])) $allowed['period_month'] = Carbon::parse($allowed['period_month'])->startOfMonth()->toDateString();
        return $allowed;
    }
}
