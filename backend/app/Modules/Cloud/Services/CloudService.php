<?php

declare(strict_types=1);

namespace App\Modules\Cloud\Services;

use App\Modules\Cloud\Models\CloudAccount;
use App\Modules\Cloud\Models\CloudBudget;
use App\Modules\Cloud\Models\CloudProject;
use App\Modules\Cloud\Models\CloudResource;
use App\Modules\Customers\Models\Customer;
use App\Modules\Files\Models\File;
use App\Modules\Providers\Models\ProviderAccount;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/** Cloud en modo manual: cuentas, proyectos y presupuestos con CRUD; recursos solo lectura (sin descubrimiento por API). */
final class CloudService
{
    public function __construct(private readonly AuditLogger $audit, private readonly CurrentOrganization $organization) {}

    // ---------------------------------------------------------------- cuentas

    /** @return list<string> */
    public static function accountRelations(): array
    {
        return ['customer:id,code,legal_name,trade_name', 'providerAccount:id,provider_id,label,external_account_id', 'providerAccount.provider:id,name'];
    }

    public function accountRules(?CloudAccount $account): array
    {
        $required = $account === null ? 'required' : 'sometimes';
        $org = $this->organization->id();
        return [
            // Las restricciones UNIQUE del esquema no excluyen filas borradas: la regla tampoco.
            'provider_account_id' => [$required, 'uuid', Rule::unique('cloud_accounts', 'provider_account_id')->where('organization_id', $org)->ignore($account?->id)],
            'platform' => [$required, Rule::in(CloudAccount::PLATFORMS)],
            'external_account_id' => [$required, 'string', 'min:1', 'max:200'],
            'owner' => [$required, Rule::in(CloudAccount::OWNERS)],
            'modality' => [$required, Rule::in(CloudAccount::MODALITIES)],
            'customer_id' => ['sometimes', 'nullable', 'uuid'],
            'authorization_file_id' => ['sometimes', 'nullable', 'uuid'],
            'access_reference' => ['sometimes', 'nullable', 'string', 'max:500'],
            'period_start' => ['sometimes', 'nullable', 'date'],
            'period_end' => ['sometimes', 'nullable', 'date'],
            'tagging_status' => ['sometimes', Rule::in(CloudAccount::TAGGING)],
            'access_revoked_at' => ['sometimes', 'nullable', 'date'],
            'status' => ['sometimes', Rule::in(CloudAccount::STATUSES)],
        ] + ($account === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function createAccount(array $data): CloudAccount
    {
        $this->checkAccount($data, null);
        return DB::transaction(function () use ($data): CloudAccount {
            $account = new CloudAccount($data);
            $account->save();
            $this->audit->record('cloud_account.created', 'cloud_account', $account->id, null, $account->refresh()->attributesToArray(), [], $account->customer_id);
            return $this->loadedAccount($account);
        });
    }

    public function updateAccount(CloudAccount $account, array $data): CloudAccount
    {
        $version = $data['version'];
        unset($data['version']);
        $this->checkAccount($data, $account);
        return DB::transaction(function () use ($account, $data, $version): CloudAccount {
            VersionGuard::check($account, $version);
            $before = $account->attributesToArray();
            $account->fill($data)->save();
            $this->audit->record('cloud_account.updated', 'cloud_account', $account->id, $before, $account->refresh()->attributesToArray(), [], $account->customer_id);
            return $this->loadedAccount($account);
        });
    }

    public function deleteAccount(CloudAccount $account): void
    {
        if (CloudProject::query()->where('cloud_account_id', $account->id)->exists()) {
            throw ProblemException::validation(['id' => ['La cuenta tiene proyectos cloud; elimínalos primero.']]);
        }
        DB::transaction(function () use ($account): void {
            $before = $account->attributesToArray();
            $account->delete();
            $this->audit->record('cloud_account.deleted', 'cloud_account', $account->id, $before, null, [], $account->customer_id);
        });
    }

    public function loadedAccount(CloudAccount $account): CloudAccount
    {
        return $account->load(self::accountRelations())->loadCount('projects');
    }

    /** Vínculos por scope de organización (404 cross-org) y reglas cruzadas titular/modalidad. */
    private function checkAccount(array $data, ?CloudAccount $current): void
    {
        $get = static fn (string $key) => array_key_exists($key, $data) ? $data[$key] : $current?->{$key};

        if (! empty($data['customer_id'])) { Customer::query()->findOrFail($data['customer_id']); }
        if (! empty($data['authorization_file_id'])) { File::query()->findOrFail($data['authorization_file_id']); }
        $providerAccount = ! empty($data['provider_account_id']) ? ProviderAccount::query()->findOrFail($data['provider_account_id']) : null;

        // Unicidad (organización, plataforma, cuenta externa), incluidas las borradas por la restricción del esquema.
        if (array_key_exists('platform', $data) || array_key_exists('external_account_id', $data)) {
            $taken = CloudAccount::query()->withTrashed()->where('platform', $get('platform'))->where('external_account_id', $get('external_account_id'))
                ->when($current !== null, fn (Builder $q) => $q->where('id', '!=', $current->id))->exists();
            if ($taken) { throw ProblemException::validation(['external_account_id' => ['Esa cuenta ya está registrada para la plataforma.']]); }
        }

        if ($get('owner') === 'customer') {
            if ($get('customer_id') === null) { throw ProblemException::validation(['customer_id' => ['El titular cliente exige un cliente vinculado.']]); }
            if ($get('authorization_file_id') === null) { throw ProblemException::validation(['authorization_file_id' => ['Una cuenta del cliente exige su autorización adjunta.']]); }
        }
        if ($get('modality') === 'managed_new_account_handover') {
            $start = $get('period_start');
            $end = $get('period_end');
            if ($start === null || $end === null) {
                throw ProblemException::validation(['period_start' => ['La entrega al final del periodo exige fecha de inicio y de fin.']]);
            }
            if (CarbonImmutable::parse((string) $end)->lte(CarbonImmutable::parse((string) $start))) {
                throw ProblemException::validation(['period_end' => ['La fecha de fin debe ser posterior al inicio.']]);
            }
        }
        // Una cuenta de proveedor propiedad de un cliente no puede vincularse a la cuenta cloud de otro.
        $customerId = $get('customer_id');
        if ($providerAccount !== null && $providerAccount->owner === 'customer' && $providerAccount->customer_id !== null
            && (string) $providerAccount->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['provider_account_id' => ['La cuenta de proveedor pertenece a otro cliente.']]);
        }
    }

    // -------------------------------------------------------------- proyectos

    /** @return list<string> */
    public static function projectRelations(): array
    {
        return ['customer:id,code,legal_name,trade_name', 'account:id,provider_account_id,platform,external_account_id,owner,status'];
    }

    /** Proyectos con costo (suma de recursos en una moneda) y presupuesto del mes actual como subconsultas. */
    public function projectQuery(): Builder
    {
        $month = now()->startOfMonth()->toDateString();
        $res = fn () => CloudResource::query()->whereColumn('cloud_resources.cloud_project_id', 'cloud_projects.id');
        $bud = fn () => CloudBudget::query()->whereColumn('cloud_budgets.cloud_project_id', 'cloud_projects.id')->where('cloud_budgets.period_month', $month)->limit(1);
        return CloudProject::query()->select('cloud_projects.*')->addSelect([
            'resources_count' => $res()->selectRaw('count(*)'),
            'cost_currency_calc' => $res()->selectRaw('min(cost_currency)'),
            'cost_minor_calc' => $res()->selectRaw('sum(monthly_cost_minor) filter (where cost_currency = (select min(r2.cost_currency) from cloud_resources r2 where r2.cloud_project_id = cloud_resources.cloud_project_id))'),
            'budget_id' => $bud()->select('id'),
            'budget_amount_minor' => $bud()->select('amount_minor'),
            'budget_actual_minor' => $bud()->select('actual_minor'),
            'budget_currency' => $bud()->select('cost_currency'),
        ])->with(self::projectRelations());
    }

    public function projectRules(?CloudProject $project): array
    {
        $required = $project === null ? 'required' : 'sometimes';
        return [
            'cloud_account_id' => [$required, 'uuid'],
            'customer_id' => ['sometimes', 'nullable', 'uuid'],
            'name' => [$required, 'string', 'min:1', 'max:200'],
            'external_id' => ['sometimes', 'nullable', 'string', 'max:200'],
            'environment' => ['sometimes', Rule::in(CloudProject::ENVIRONMENTS)],
            'region' => ['sometimes', 'nullable', 'string', 'max:100'],
            'visible_to_customer' => ['sometimes', 'boolean'],
            'is_shared' => ['sometimes', 'boolean'],
            'tags' => ['sometimes', 'nullable', 'array', 'max:50'],
            'tags.*' => ['nullable', 'string', 'max:200'],
        ] + ($project === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function createProject(array $data): CloudProject
    {
        $data = $this->normalizeProject($data);
        $data = $this->checkProject($data, null);
        return DB::transaction(function () use ($data): CloudProject {
            $project = new CloudProject($data);
            $project->save();
            $this->audit->record('cloud_project.created', 'cloud_project', $project->id, null, $project->refresh()->attributesToArray(), [], $project->customer_id);
            return $this->loadedProject($project->id);
        });
    }

    public function updateProject(CloudProject $project, array $data): CloudProject
    {
        $version = $data['version'];
        unset($data['version']);
        $data = $this->normalizeProject($data);
        $data = $this->checkProject($data, $project);
        return DB::transaction(function () use ($project, $data, $version): CloudProject {
            VersionGuard::check($project, $version);
            $before = $project->attributesToArray();
            $project->fill($data)->save();
            $this->audit->record('cloud_project.updated', 'cloud_project', $project->id, $before, $project->refresh()->attributesToArray(), [], $project->customer_id);
            return $this->loadedProject($project->id);
        });
    }

    public function deleteProject(CloudProject $project): void
    {
        if (CloudResource::query()->where('cloud_project_id', $project->id)->exists()) {
            throw ProblemException::validation(['id' => ['El proyecto tiene recursos registrados; no se puede eliminar.']]);
        }
        DB::transaction(function () use ($project): void {
            $before = $project->attributesToArray();
            CloudBudget::query()->where('cloud_project_id', $project->id)->delete();
            $project->delete();
            $this->audit->record('cloud_project.deleted', 'cloud_project', $project->id, $before, null, [], $project->customer_id);
        });
    }

    public function loadedProject(string $id): CloudProject
    {
        return $this->projectQuery()->findOrFail($id);
    }

    private function normalizeProject(array $data): array
    {
        if (array_key_exists('tags', $data)) { $data['tags'] = (object) ($data['tags'] ?? []); }
        return $data;
    }

    private function checkProject(array $data, ?CloudProject $current): array
    {
        if (! empty($data['customer_id'])) { Customer::query()->findOrFail($data['customer_id']); }
        $accountId = $data['cloud_account_id'] ?? $current?->cloud_account_id;
        $account = CloudAccount::query()->findOrFail($accountId);
        $customerId = array_key_exists('customer_id', $data) ? $data['customer_id'] : $current?->customer_id;

        // Sin cliente explícito en el alta, hereda el de la cuenta cloud.
        if ($current === null && ! array_key_exists('customer_id', $data) && $account->customer_id !== null) {
            $customerId = $data['customer_id'] = $account->customer_id;
        }
        // Una cuenta de cliente solo admite proyectos de ese mismo cliente.
        if ($account->owner === 'customer' && $account->customer_id !== null && $customerId !== null
            && (string) $account->customer_id !== (string) $customerId) {
            throw ProblemException::validation(['customer_id' => ['La cuenta cloud pertenece a otro cliente.']]);
        }
        return $data;
    }

    // ----------------------------------------------------------- presupuestos

    public function budgetRules(?CloudBudget $budget): array
    {
        $required = $budget === null ? 'required' : 'sometimes';
        return [
            'cloud_project_id' => $budget === null ? ['required', 'uuid'] : ['prohibited'],
            'period_month' => [$required, 'regex:/\A\d{4}-(0[1-9]|1[0-2])(-\d{2})?\z/'],
            'amount_minor' => [$required, 'integer', 'min:1', 'max:999999999999999'],
            'cost_currency' => [$required, 'string', 'regex:/\A[A-Za-z]{3}\z/'],
            'actual_minor' => ['sometimes', 'integer', 'min:0', 'max:999999999999999'],
        ] + ($budget === null ? [] : ['version' => ['required', 'integer', 'min:1']]);
    }

    public function createBudget(array $data): CloudBudget
    {
        $data = $this->normalizeBudget($data);
        CloudProject::query()->findOrFail($data['cloud_project_id']);
        $this->checkBudgetUnique($data['cloud_project_id'], $data['period_month'], null);
        return DB::transaction(function () use ($data): CloudBudget {
            $budget = new CloudBudget($data);
            $budget->save();
            $this->audit->record('cloud_budget.created', 'cloud_budget', $budget->id, null, $budget->refresh()->attributesToArray(), ['cloud_project_id' => $budget->cloud_project_id]);
            return $this->loadedBudget($budget);
        });
    }

    public function updateBudget(CloudBudget $budget, array $data): CloudBudget
    {
        $version = $data['version'];
        unset($data['version']);
        $data = $this->normalizeBudget($data);
        if (isset($data['period_month'])) { $this->checkBudgetUnique($budget->cloud_project_id, $data['period_month'], $budget); }
        return DB::transaction(function () use ($budget, $data, $version): CloudBudget {
            VersionGuard::check($budget, $version);
            $before = $budget->attributesToArray();
            $budget->fill($data)->save();
            $this->audit->record('cloud_budget.updated', 'cloud_budget', $budget->id, $before, $budget->refresh()->attributesToArray(), ['cloud_project_id' => $budget->cloud_project_id]);
            return $this->loadedBudget($budget);
        });
    }

    public function deleteBudget(CloudBudget $budget): void
    {
        DB::transaction(function () use ($budget): void {
            $before = $budget->attributesToArray();
            $budget->delete();
            $this->audit->record('cloud_budget.deleted', 'cloud_budget', $budget->id, $before, null, ['cloud_project_id' => $budget->cloud_project_id]);
        });
    }

    public function loadedBudget(CloudBudget $budget): CloudBudget
    {
        return $budget->load('project:id,name,customer_id,cloud_account_id');
    }

    private function normalizeBudget(array $data): array
    {
        if (isset($data['period_month'])) { $data['period_month'] = CarbonImmutable::parse(substr((string) $data['period_month'], 0, 7).'-01')->toDateString(); }
        if (isset($data['cost_currency'])) { $data['cost_currency'] = strtoupper($data['cost_currency']); }
        return $data;
    }

    private function checkBudgetUnique(string $projectId, string $month, ?CloudBudget $current): void
    {
        $taken = CloudBudget::query()->where('cloud_project_id', $projectId)->where('period_month', $month)
            ->when($current !== null, fn (Builder $q) => $q->where('id', '!=', $current->id))->exists();
        if ($taken) { throw ProblemException::validation(['period_month' => ['Ya existe un presupuesto para ese proyecto y mes.']]); }
    }

    // ---------------------------------------------------------------- resumen

    /** Tiles de la vista (toda la organización, sin filtros). Importes en unidades menores por moneda. */
    public function summary(): array
    {
        $month = now()->startOfMonth()->toDateString();
        $acc = CloudAccount::query()->selectRaw("count(*) as total, count(*) filter (where status = 'active') as active")->first();
        $res = CloudResource::query()->selectRaw("count(*) as total, count(*) filter (where assignment_status = 'unassigned') as unassigned")->first();
        $costs = CloudResource::query()->whereNotNull('cost_currency')->where('status', '!=', 'terminated')
            ->selectRaw('cost_currency as currency, sum(monthly_cost_minor) as monthly_minor')->groupBy('cost_currency')->orderBy('cost_currency')->get();
        $budgets = CloudBudget::query()->where('period_month', $month)
            ->selectRaw('cost_currency as currency, sum(amount_minor) as budget_minor, sum(actual_minor) as actual_minor, count(*) filter (where actual_minor >= amount_minor) as over_budget')
            ->groupBy('cost_currency')->orderBy('cost_currency')->get();
        return [
            'accounts_total' => (int) $acc->total, 'accounts_active' => (int) $acc->active,
            'projects_total' => CloudProject::query()->count(),
            'projects_hidden' => CloudProject::query()->where('visible_to_customer', false)->count(),
            'resources_total' => (int) $res->total, 'resources_unassigned' => (int) $res->unassigned,
            'monthly_cost_by_currency' => $costs->map(fn ($r) => ['currency' => $r->currency, 'monthly_minor' => (int) $r->monthly_minor])->all(),
            'budget_month' => substr($month, 0, 7),
            'budget_by_currency' => $budgets->map(fn ($r) => ['currency' => $r->currency, 'budget_minor' => (int) $r->budget_minor, 'actual_minor' => (int) $r->actual_minor, 'over_budget' => (int) $r->over_budget])->all(),
            'over_budget_projects' => (int) $budgets->sum('over_budget'),
        ];
    }
}
