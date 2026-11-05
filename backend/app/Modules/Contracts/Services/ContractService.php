<?php

declare(strict_types=1);

namespace App\Modules\Contracts\Services;

use App\Modules\Contracts\Models\Contract;
use App\Modules\Contracts\Models\ContractVersion;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

final class ContractService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    public function rules(): array
    {
        $org = $this->organization->id();
        return [
            'customer_id' => ['required', 'uuid', Rule::exists('customers', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'brand_id' => ['required', 'uuid', Rule::exists('brands', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'contract_template_id' => ['nullable', 'uuid', Rule::exists('contract_templates', 'id')->where('organization_id', $org)],
            'quote_id' => ['nullable', 'uuid', Rule::exists('quotes', 'id')->where('organization_id', $org)->whereNull('deleted_at')],
            'currency' => ['required', Rule::in(['PEN', 'USD'])],
            'starts_on' => ['nullable', 'date'], 'ends_on' => ['nullable', 'date', 'after_or_equal:starts_on'],
            'management_fee_percent' => ['nullable', 'numeric', 'min:0'], 'management_fee_min_minor' => ['nullable', 'integer', 'min:0'],
            'included_hours' => ['nullable', 'numeric', 'min:0'], 'kind' => ['sometimes', Rule::in(['contract', 'terms'])],
            'body' => ['required', 'string'], 'clause_ids' => ['sometimes', 'array'], 'clause_ids.*' => ['uuid'],
            'variables' => ['sometimes', 'array'],
        ];
    }

    public function updateRules(): array
    {
        $rules = $this->rules();
        $rules['version'] = ['required', 'integer'];
        foreach (['customer_id', 'brand_id', 'currency'] as $key) { $rules[$key][0] = 'sometimes'; }
        foreach (['contract_template_id', 'quote_id', 'starts_on', 'ends_on', 'management_fee_percent', 'management_fee_min_minor', 'included_hours'] as $key) { $rules[$key][0] = 'sometimes'; }
        $rules['body'][0] = 'sometimes';
        $rules['change_summary'] = ['sometimes', 'nullable', 'string', 'max:2000'];
        $rules['kind'] = ['sometimes', Rule::in(['contract', 'terms'])];
        $rules['custom'] = ['sometimes', 'array'];
        return $rules;
    }

    public function create(array $data, ?string $idempotencyKey = null): Contract
    {
        return DB::transaction(function () use ($data): Contract {
            $contract = new Contract;
            $contract->forceFill($this->headerData($data) + ['number' => $this->nextNumber(), 'status' => 'draft', 'current_version' => 1]);
            $contract->save();
            $version = $this->makeVersion($contract, 1, 'original', $data);
            $this->audit->record('contract.created', 'contract', $contract->id, null, $this->auditState($contract, $version), [], $contract->customer_id);
            return $this->loaded($contract);
        });
    }

    public function updateDraft(Contract $contract, array $data): Contract
    {
        return DB::transaction(function () use ($contract, $data): Contract {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            VersionGuard::check($contract, $data['version']);
            if (! in_array($contract->status, ['draft', 'in_review'], true)) { throw new ProblemException(409, 'invalid_transition', 'Solo se edita un contrato en borrador o revisión.', ['status' => $contract->status]); }
            $before = $this->auditState($contract, $contract->currentVersion()->first());
            $header = $this->headerData($data, $contract);
            $this->assertDateRange($header['starts_on'] ?? $contract->starts_on?->toDateString(), $header['ends_on'] ?? $contract->ends_on?->toDateString());
            $contract->forceFill($header)->save();
            $version = $contract->currentVersion()->firstOrFail();
            $version->forceFill([
                'body' => $data['body'] ?? $version->body,
                'variables_snapshot' => $data['variables'] ?? $version->variables_snapshot,
                'clause_ids' => $data['clause_ids'] ?? $version->clause_ids,
                'change_summary' => $data['change_summary'] ?? $version->change_summary,
            ])->save();
            $this->audit->record('contract.updated', 'contract', $contract->id, $before, $this->auditState($contract, $version), [], $contract->customer_id);
            return $this->loaded($contract);
        });
    }

    public function submit(Contract $contract, int $version): Contract { return $this->transition($contract, $version, ['draft'], 'in_review', [], 'contract.submitted'); }
    public function approve(Contract $contract, int $version): Contract { return $this->transition($contract, $version, ['in_review'], 'approved', ['approved_by' => Auth::id(), 'approved_at' => now()], 'contract.approved'); }
    public function send(Contract $contract, int $version): Contract { return $this->transition($contract, $version, ['approved'], 'sent', ['sent_at' => now()], 'contract.sent'); }
    public function sign(Contract $contract, int $version): Contract { return $this->transition($contract, $version, ['sent'], 'signed_active', ['signed_at' => now()], 'contract.signed', [], true); }
    public function terminate(Contract $contract, string $reason, int $version): Contract { return $this->transition($contract, $version, ['signed_active'], 'terminated', ['terminated_at' => now(), 'termination_reason' => $reason], 'contract.terminated', ['reason' => $reason]); }
    public function expire(Contract $contract, int $version): Contract { return $this->transition($contract, $version, ['sent', 'signed_active'], 'expired', [], 'contract.expired'); }

    public function addendum(Contract $contract, array $data): Contract
    {
        return DB::transaction(function () use ($contract, $data): Contract {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            VersionGuard::check($contract, $data['version']);
            if ($contract->status !== 'signed_active') { throw ProblemException::validation(['status' => ['Solo se agrega una adenda a un contrato firmado y activo.']]); }
            $before = $this->auditState($contract, $contract->currentVersion()->first());
            $number = (int) $contract->current_version + 1;
            $version = $this->makeVersion($contract, $number, 'addendum', $data);
            $contract->forceFill(['current_version' => $number])->save();
            $this->audit->record('contract.addendum_created', 'contract', $contract->id, $before, $this->auditState($contract, $version), ['change_summary' => $data['change_summary'] ?? null], $contract->customer_id);
            return $this->loaded($contract);
        });
    }

    public function deleteDraft(Contract $contract, int $version): void
    {
        DB::transaction(function () use ($contract, $version): void {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            VersionGuard::check($contract, $version);
            if ($contract->status !== 'draft') { throw new ProblemException(409, 'invalid_transition', 'Solo se elimina un contrato en borrador.', ['status' => $contract->status]); }
            $before = $contract->attributesToArray();
            $contract->delete();
            $this->audit->record('contract.deleted', 'contract', $contract->id, $before, null, [], $contract->customer_id);
        });
    }

    private function transition(Contract $contract, int $version, array $from, string $to, array $state, string $action, array $metadata = [], bool $lockVersion = false): Contract
    {
        return DB::transaction(function () use ($contract, $version, $from, $to, $state, $action, $metadata, $lockVersion): Contract {
            $contract = Contract::query()->lockForUpdate()->findOrFail($contract->id);
            VersionGuard::check($contract, $version);
            if (! in_array($contract->status, $from, true)) { throw ProblemException::validation(['status' => ["No se puede cambiar de {$contract->status} a {$to}."]]); }
            $before = $contract->attributesToArray();
            $contract->forceFill(['status' => $to] + $state)->save();
            if ($lockVersion) { $contract->currentVersion()->firstOrFail()->forceFill(['locked_at' => now()])->save(); }
            $this->audit->record($action, 'contract', $contract->id, $before, $contract->refresh()->attributesToArray(), $metadata, $contract->customer_id);
            return $this->loaded($contract);
        });
    }

    private function makeVersion(Contract $contract, int $number, string $kind, array $data): ContractVersion
    {
        $version = new ContractVersion;
        $version->forceFill(['contract_id' => $contract->id, 'version_number' => $number, 'kind' => $kind, 'body' => $data['body'], 'variables_snapshot' => $data['variables'] ?? [], 'clause_ids' => array_values($data['clause_ids'] ?? []), 'change_summary' => $data['change_summary'] ?? null])->save();
        return $version;
    }

    private function nextNumber(): string
    {
        $org = $this->organization->id();
        DB::table('code_sequences')->insertOrIgnore(['organization_id' => $org, 'entity' => 'contract', 'prefix' => 'CTR', 'padding' => 6, 'next_value' => 1]);
        return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, 'contract'])->code;
    }

    private function headerData(array $data, ?Contract $contract = null): array
    {
        $keys = ['customer_id', 'brand_id', 'contract_template_id', 'quote_id', 'starts_on', 'ends_on', 'currency', 'management_fee_percent', 'management_fee_min_minor', 'included_hours', 'kind', 'custom'];
        $out = [];
        foreach ($keys as $key) { if (array_key_exists($key, $data)) { $out[$key] = $data[$key]; } }
        return $out;
    }

    private function assertDateRange(?string $startsOn, ?string $endsOn): void
    {
        if ($startsOn !== null && $endsOn !== null && $endsOn < $startsOn) {
            throw ProblemException::validation(['ends_on' => ['La fecha de fin debe ser igual o posterior a la fecha de inicio.']]);
        }
    }

    private function auditState(Contract $contract, ?ContractVersion $version): array
    {
        return ['id' => $contract->id, 'number' => $contract->number, 'status' => $contract->status, 'current_version' => $contract->current_version, 'version_id' => $version?->id];
    }

    private function loaded(Contract $contract): Contract
    {
        return $contract->load(['currentVersion', 'customer:id,code,legal_name,trade_name', 'brand:id,name', 'approver:id,name']);
    }
}
