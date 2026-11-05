<?php

declare(strict_types=1);

namespace App\Modules\Finance\Services;

use App\Modules\Finance\Models\Cost;
use App\Modules\Finance\Models\CostAllocation;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class CostAllocationService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}
    public function rules(): array { return $this->editableRules(false); }
    public function updateRules(): array { return ['version' => ['required', 'integer']] + $this->editableRules(true); }
    private function editableRules(bool $updating): array
    {
        $req = $updating ? 'sometimes' : 'required'; $org = $this->organization->id();
        return [
            'cost_id' => [$req, 'uuid', Rule::exists('costs', 'id')->where('organization_id', $org)],
            'service_id' => [$req, 'uuid', Rule::exists('services', 'id')->where('organization_id', $org)],
            'saas_instance_id' => ['sometimes', 'nullable', 'uuid'], 'share_percent' => ['sometimes', 'nullable', 'numeric', 'min:0', 'max:100'],
            'amount_minor' => [$req, 'integer', 'min:0'], 'cost_currency' => [$req, 'regex:/^[A-Z]{3}$/'], 'basis' => ['sometimes', 'array'],
        ];
    }
    public function create(array $data): CostAllocation
    {
        return DB::transaction(function () use ($data): CostAllocation {
            $cost = Cost::query()->lockForUpdate()->findOrFail($data['cost_id']); $this->assertWithinCost($cost, (int) $data['amount_minor'], (string) $data['cost_currency']);
            $this->assertUniqueService((string) $data['cost_id'], (string) $data['service_id']);
            $allocation = new CostAllocation; $allocation->forceFill($this->editableData($data))->save();
            $this->audit->record('cost_allocation.created', 'cost_allocation', $allocation->id, null, $allocation->refresh()->attributesToArray()); return $allocation;
        });
    }
    public function update(CostAllocation $allocation, array $data): CostAllocation
    {
        return DB::transaction(function () use ($allocation, $data): CostAllocation {
            $allocation = CostAllocation::query()->lockForUpdate()->findOrFail($allocation->id); VersionGuard::check($allocation, $data['version']);
            $costId = $data['cost_id'] ?? $allocation->cost_id; $cost = Cost::query()->lockForUpdate()->findOrFail($costId);
            $amount = (int) ($data['amount_minor'] ?? $allocation->amount_minor); $currency = (string) ($data['cost_currency'] ?? $allocation->cost_currency);
            $this->assertWithinCost($cost, $amount, $currency, $allocation->id);
            $this->assertUniqueService((string) ($data['cost_id'] ?? $allocation->cost_id), (string) ($data['service_id'] ?? $allocation->service_id), $allocation->id);
            $before = $allocation->attributesToArray(); $allocation->forceFill($this->editableData($data))->save();
            $this->audit->record('cost_allocation.updated', 'cost_allocation', $allocation->id, $before, $allocation->refresh()->attributesToArray()); return $allocation;
        });
    }
    public function delete(CostAllocation $allocation, int $version): void
    {
        DB::transaction(function () use ($allocation, $version): void {
            $allocation = CostAllocation::query()->lockForUpdate()->findOrFail($allocation->id); VersionGuard::check($allocation, $version);
            $before = $allocation->attributesToArray(); $allocation->delete(); $this->audit->record('cost_allocation.deleted', 'cost_allocation', $allocation->id, $before, ['deleted' => true]);
        });
    }
    private function assertWithinCost(Cost $cost, int $amount, string $currency, ?string $ignoreId = null): void
    {
        if ($currency !== $cost->cost_currency) throw ProblemException::validation(['cost_currency' => ['La moneda de la asignación debe coincidir con la del costo.']]);
        $sum = (int) $cost->allocations()->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->sum('amount_minor');
        if ($sum + $amount > (int) $cost->amount_minor) throw ProblemException::validation(['amount_minor' => ['La suma de asignaciones excede el monto del costo.']]);
    }
    private function assertUniqueService(string $costId, string $serviceId, ?string $ignoreId = null): void
    {
        $exists = CostAllocation::query()->where('cost_id', $costId)->where('service_id', $serviceId)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists();
        if ($exists) throw ProblemException::validation(['service_id' => ['Ya existe una asignación para este costo y servicio.']]);
    }
    private function editableData(array $data): array { return array_intersect_key($data, array_flip(['cost_id', 'service_id', 'saas_instance_id', 'share_percent', 'amount_minor', 'cost_currency', 'basis'])); }
}
