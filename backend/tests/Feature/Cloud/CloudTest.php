<?php

declare(strict_types=1);

namespace Tests\Feature\Cloud;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Módulo Cloud (MVP manual): CRUD de cuentas, proyectos y presupuestos; recursos solo lectura; aislamiento y permisos. */
final class CloudTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $org;

    private string $brand;

    private string $customer;

    private string $customer2;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Cloud SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'cld-a', 'name' => 'Cld A', 'portal_domain' => 'portal.cld-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Uno SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->customer2 = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Zeta Corp SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100047218', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function providerAccount(?string $org = null, string $owner = 'company', ?string $customer = null): string
    {
        $provider = (string) Str::uuid();
        $account = (string) Str::uuid();
        $n = ++$this->seq;
        DB::table('providers')->insert(['id' => $provider, 'organization_id' => $org ?? $this->org, 'code' => 'aws-'.substr($provider, 0, 6), 'name' => 'Amazon Web Services', 'type' => 'cloud']);
        DB::table('provider_accounts')->insert(['id' => $account, 'organization_id' => $org ?? $this->org, 'provider_id' => $provider, 'label' => "cuenta-cloud-{$n}", 'owner' => $owner, 'customer_id' => $customer]);
        return $account;
    }

    private function file(?string $org = null): string
    {
        $id = (string) Str::uuid();
        DB::table('files')->insert(['id' => $id, 'organization_id' => $org ?? $this->org, 'path' => "x/{$id}.pdf", 'original_name' => 'autorizacion.pdf', 'mime_type' => 'application/pdf', 'size_bytes' => 10]);
        return $id;
    }

    private function otherOrgId(): string
    {
        $id = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $id, 'name' => 'Otra organización cloud', 'slug' => 'otra-cloud-'.substr($id, 0, 6)]);
        return $id;
    }

    /** @return array<string, mixed> */
    private function account(array $extra = []): array
    {
        $n = ++$this->seq;
        return $this->postJson('/api/v1/admin/cloud/accounts', $extra + [
            'provider_account_id' => $this->providerAccount(), 'platform' => 'aws', 'external_account_id' => "1234567890{$n}",
            'owner' => 'company', 'modality' => 'dedicated_company_account',
        ])->assertCreated()->json('data');
    }

    /** @return array<string, mixed> */
    private function project(string $accountId, array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/cloud/projects', $extra + ['cloud_account_id' => $accountId, 'name' => 'Proyecto '.(++$this->seq)])->assertCreated()->json('data');
    }

    private function resource(string $project, string $ext, array $extra = []): string
    {
        $id = (string) Str::uuid();
        DB::table('cloud_resources')->insert($extra + ['id' => $id, 'organization_id' => $this->org, 'cloud_project_id' => $project, 'resource_type' => 'ec2', 'external_id' => $ext, 'name' => $ext]);
        return $id;
    }

    public function test_account_crud_validation_and_concurrency(): void
    {
        $pa = $this->providerAccount();
        $created = $this->postJson('/api/v1/admin/cloud/accounts', [
            'provider_account_id' => $pa, 'platform' => 'aws', 'external_account_id' => '111122223333',
            'owner' => 'company', 'modality' => 'dedicated_company_account', 'customer_id' => $this->customer,
        ])->assertCreated()
            ->assertJsonPath('data.platform', 'aws')->assertJsonPath('data.status', 'active')->assertJsonPath('data.tagging_status', 'pending')
            ->assertJsonPath('data.customer.name', 'Cliente Uno SAC')->assertJsonPath('data.provider_account.provider_name', 'Amazon Web Services')
            ->assertJsonPath('data.projects_count', 0)->assertJsonPath('data.version', 1)->json('data');

        $this->getJson('/api/v1/admin/cloud/accounts/'.$created['id'])->assertOk()->assertJsonPath('data.external_account_id', '111122223333');
        $this->patchJson('/api/v1/admin/cloud/accounts/'.$created['id'], ['version' => 1, 'tagging_status' => 'done', 'access_reference' => 'arn:aws:iam::1:role/x'])
            ->assertOk()->assertJsonPath('data.tagging_status', 'done')->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson('/api/v1/admin/cloud/accounts/'.$created['id'], ['version' => 1, 'tagging_status' => 'pending']), 409, 'version_conflict');
        $this->patchJson('/api/v1/admin/cloud/accounts/'.$created['id'], ['tagging_status' => 'pending'])->assertStatus(422);

        // Enums y obligatorios.
        $this->postJson('/api/v1/admin/cloud/accounts', ['provider_account_id' => $this->providerAccount(), 'platform' => 'oracle', 'external_account_id' => 'x', 'owner' => 'company', 'modality' => 'dedicated_company_account'])->assertStatus(422)->assertJsonValidationErrors('platform');
        $this->postJson('/api/v1/admin/cloud/accounts', ['platform' => 'aws'])->assertStatus(422)->assertJsonValidationErrors(['provider_account_id', 'external_account_id', 'owner', 'modality']);
        // Una cuenta de proveedor no se reutiliza; (plataforma, cuenta externa) es única.
        $this->postJson('/api/v1/admin/cloud/accounts', ['provider_account_id' => $pa, 'platform' => 'azure', 'external_account_id' => 'otra', 'owner' => 'company', 'modality' => 'shared_saas'])->assertStatus(422)->assertJsonValidationErrors('provider_account_id');
        $this->postJson('/api/v1/admin/cloud/accounts', ['provider_account_id' => $this->providerAccount(), 'platform' => 'aws', 'external_account_id' => '111122223333', 'owner' => 'company', 'modality' => 'shared_saas'])->assertStatus(422)->assertJsonValidationErrors('external_account_id');

        // Borrado: con proyectos, 422; sin proyectos, 204 y desaparece.
        $project = $this->project($created['id']);
        $this->deleteJson('/api/v1/admin/cloud/accounts/'.$created['id'])->assertStatus(422);
        $this->deleteJson('/api/v1/admin/cloud/projects/'.$project['id'])->assertNoContent();
        $this->deleteJson('/api/v1/admin/cloud/accounts/'.$created['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/cloud/accounts/'.$created['id'])->assertNotFound();
        $this->assertNotNull(DB::table('cloud_accounts')->where('id', $created['id'])->value('deleted_at'));
    }

    public function test_customer_owner_requires_customer_and_authorization_file(): void
    {
        $base = ['provider_account_id' => $this->providerAccount(), 'platform' => 'gcp', 'external_account_id' => 'gcp-1', 'owner' => 'customer', 'modality' => 'managed_customer_account'];
        $this->postJson('/api/v1/admin/cloud/accounts', $base)->assertStatus(422)->assertJsonValidationErrors('customer_id');
        $this->postJson('/api/v1/admin/cloud/accounts', $base + ['customer_id' => $this->customer])->assertStatus(422)->assertJsonValidationErrors('authorization_file_id');
        $file = $this->file();
        $this->postJson('/api/v1/admin/cloud/accounts', $base + ['customer_id' => $this->customer, 'authorization_file_id' => $file])
            ->assertCreated()->assertJsonPath('data.owner', 'customer')->assertJsonPath('data.authorization_file_id', $file);

        // Cambiar a titular cliente en una cuenta de la empresa exige los dos campos.
        $acc = $this->account();
        $this->patchJson('/api/v1/admin/cloud/accounts/'.$acc['id'], ['version' => 1, 'owner' => 'customer'])->assertStatus(422)->assertJsonValidationErrors('customer_id');

        // Entrega al final del periodo: fechas obligatorias y coherentes.
        $h = ['provider_account_id' => $this->providerAccount(), 'platform' => 'aws', 'external_account_id' => 'h-1', 'owner' => 'company', 'modality' => 'managed_new_account_handover'];
        $this->postJson('/api/v1/admin/cloud/accounts', $h)->assertStatus(422)->assertJsonValidationErrors('period_start');
        $this->postJson('/api/v1/admin/cloud/accounts', $h + ['period_start' => '2026-05-01', 'period_end' => '2026-04-01'])->assertStatus(422)->assertJsonValidationErrors('period_end');
        $this->postJson('/api/v1/admin/cloud/accounts', $h + ['period_start' => '2026-05-01', 'period_end' => '2026-08-01'])->assertCreated()->assertJsonPath('data.period_end', '2026-08-01');

        // Cuenta de proveedor de otro cliente.
        $foreign = $this->providerAccount(owner: 'customer', customer: $this->customer2);
        $this->postJson('/api/v1/admin/cloud/accounts', ['provider_account_id' => $foreign, 'platform' => 'aws', 'external_account_id' => 'f-1', 'owner' => 'company', 'modality' => 'shared_saas', 'customer_id' => $this->customer])
            ->assertStatus(422)->assertJsonValidationErrors('provider_account_id');
    }

    public function test_project_crud_cost_budget_and_links(): void
    {
        $account = $this->account(['customer_id' => $this->customer]);
        $created = $this->postJson('/api/v1/admin/cloud/projects', [
            'cloud_account_id' => $account['id'], 'name' => 'Tienda', 'environment' => 'staging', 'region' => 'us-east-1',
            'tags' => ['cliente' => 'uno'], 'visible_to_customer' => false,
        ])->assertCreated()
            ->assertJsonPath('data.customer_id', $this->customer)  // hereda el cliente de la cuenta
            ->assertJsonPath('data.environment', 'staging')->assertJsonPath('data.visible_to_customer', false)
            ->assertJsonPath('data.tags.cliente', 'uno')->assertJsonPath('data.account.platform', 'aws')
            ->assertJsonPath('data.resources_count', 0)->assertJsonPath('data.cost', null)->assertJsonPath('data.budget', null)
            ->assertJsonPath('data.version', 1)->json('data');

        // Recursos: costo en una moneda; presupuesto del mes actual con consumo y proyección.
        $this->resource($created['id'], 'i-1', ['monthly_cost_minor' => 5000, 'cost_currency' => 'USD']);
        $this->resource($created['id'], 'i-2', ['monthly_cost_minor' => 2500, 'cost_currency' => 'USD']);
        $this->resource($created['id'], 'i-3');
        $month = now()->format('Y-m');
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $created['id'], 'period_month' => $month, 'amount_minor' => 10000, 'cost_currency' => 'usd', 'actual_minor' => 7500])->assertCreated();
        $shown = $this->getJson('/api/v1/admin/cloud/projects/'.$created['id'])->assertOk()
            ->assertJsonPath('data.resources_count', 3)->assertJsonPath('data.cost.monthly_minor', 7500)->assertJsonPath('data.cost.currency', 'USD')
            ->assertJsonPath('data.budget.amount_minor', 10000)->assertJsonPath('data.budget.actual_minor', 7500)->assertJsonPath('data.budget.consumption_pct', 75)->json('data');
        $expected = (int) round(7500 / max(1, now()->day) * now()->daysInMonth);
        $this->assertSame($expected, $shown['forecast_minor']);

        $this->patchJson('/api/v1/admin/cloud/projects/'.$created['id'], ['version' => 1, 'name' => 'Tienda 2', 'tags' => []])
            ->assertOk()->assertJsonPath('data.name', 'Tienda 2')->assertJsonPath('data.version', 2)->assertJsonPath('data.resources_count', 3);
        $this->assertSame('{}', DB::table('cloud_projects')->where('id', $created['id'])->value('tags'));
        $this->assertProblem($this->patchJson('/api/v1/admin/cloud/projects/'.$created['id'], ['version' => 1, 'name' => 'x']), 409, 'version_conflict');

        // Validaciones y coherencia con la cuenta.
        $this->postJson('/api/v1/admin/cloud/projects', ['cloud_account_id' => $account['id'], 'name' => 'x', 'environment' => 'prod'])->assertStatus(422)->assertJsonValidationErrors('environment');
        $this->postJson('/api/v1/admin/cloud/projects', ['name' => 'x'])->assertStatus(422)->assertJsonValidationErrors('cloud_account_id');
        $custAccount = $this->account(['owner' => 'customer', 'customer_id' => $this->customer, 'authorization_file_id' => $this->file(), 'modality' => 'managed_customer_account']);
        $this->postJson('/api/v1/admin/cloud/projects', ['cloud_account_id' => $custAccount['id'], 'name' => 'ajeno', 'customer_id' => $this->customer2])->assertStatus(422)->assertJsonValidationErrors('customer_id');

        // Borrado: con recursos, 422.
        $this->deleteJson('/api/v1/admin/cloud/projects/'.$created['id'])->assertStatus(422);
        $empty = $this->project($account['id']);
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $empty['id'], 'period_month' => $month, 'amount_minor' => 100, 'cost_currency' => 'USD'])->assertCreated();
        $this->deleteJson('/api/v1/admin/cloud/projects/'.$empty['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/cloud/projects/'.$empty['id'])->assertNotFound();
        $this->assertSame(0, DB::table('cloud_budgets')->where('cloud_project_id', $empty['id'])->count());
    }

    public function test_budget_crud_normalization_and_uniqueness(): void
    {
        $project = $this->project($this->account()['id']);
        $b = $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-03-17', 'amount_minor' => 50000, 'cost_currency' => 'pen'])
            ->assertCreated()->assertJsonPath('data.period_month', '2026-03')->assertJsonPath('data.cost_currency', 'PEN')
            ->assertJsonPath('data.actual_minor', 0)->assertJsonPath('data.consumption_pct', 0)->assertJsonPath('data.project.name', $project['name'])->json('data');
        $this->assertSame('2026-03-01', substr((string) DB::table('cloud_budgets')->where('id', $b['id'])->value('period_month'), 0, 10));

        // Un presupuesto por proyecto y mes.
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-03', 'amount_minor' => 1, 'cost_currency' => 'PEN'])->assertStatus(422)->assertJsonValidationErrors('period_month');
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-13', 'amount_minor' => 1, 'cost_currency' => 'PEN'])->assertStatus(422);
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-04', 'amount_minor' => 0, 'cost_currency' => 'PEN'])->assertStatus(422)->assertJsonValidationErrors('amount_minor');
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-04', 'amount_minor' => 5, 'cost_currency' => 'SOLES'])->assertStatus(422)->assertJsonValidationErrors('cost_currency');

        $this->patchJson('/api/v1/admin/cloud/budgets/'.$b['id'], ['version' => 1, 'actual_minor' => 25000])->assertOk()->assertJsonPath('data.consumption_pct', 50)->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson('/api/v1/admin/cloud/budgets/'.$b['id'], ['version' => 1, 'actual_minor' => 1]), 409, 'version_conflict');
        // El proyecto no se puede cambiar.
        $this->patchJson('/api/v1/admin/cloud/budgets/'.$b['id'], ['version' => 2, 'cloud_project_id' => (string) Str::uuid()])->assertStatus(422);
        $other = $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-04', 'amount_minor' => 9, 'cost_currency' => 'PEN'])->assertCreated()->json('data');
        $this->patchJson('/api/v1/admin/cloud/budgets/'.$other['id'], ['version' => 1, 'period_month' => '2026-03'])->assertStatus(422)->assertJsonValidationErrors('period_month');

        $this->deleteJson('/api/v1/admin/cloud/budgets/'.$b['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/cloud/budgets/'.$b['id'])->assertNotFound();
    }

    public function test_filters_search_summary_and_resources_read_only(): void
    {
        $aws = $this->account(['customer_id' => $this->customer]);
        $azure = $this->account(['platform' => 'azure', 'customer_id' => $this->customer2]);
        $p1 = $this->project($aws['id'], ['name' => 'Tienda 100%_web', 'environment' => 'production']);
        $p2 = $this->project($aws['id'], ['name' => 'Tienda 100xyweb', 'environment' => 'staging', 'visible_to_customer' => false]);
        $p3 = $this->project($azure['id'], ['name' => 'ERP', 'environment' => 'production']);
        $month = now()->format('Y-m');
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $p1['id'], 'period_month' => $month, 'amount_minor' => 1000, 'cost_currency' => 'USD', 'actual_minor' => 1500])->assertCreated();
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $p3['id'], 'period_month' => $month, 'amount_minor' => 4000, 'cost_currency' => 'USD', 'actual_minor' => 100])->assertCreated();

        $count = fn (string $qs): int => count($this->getJson('/api/v1/admin/cloud/projects'.$qs)->assertOk()->json('data'));
        $this->assertSame(3, $count(''));
        $this->assertSame(2, $count('?customer_id='.$this->customer));
        $this->assertSame(1, $count('?customer_id='.$this->customer2));
        $this->assertSame(2, $count('?environment=production'));
        $this->assertSame(1, $count('?platform=azure'));
        $this->assertSame(2, $count('?platform=aws'));
        $this->assertSame(1, $count('?cloud_account_id='.$azure['id']));
        $this->assertSame(1, $count('?visible_to_customer=false'));
        $this->assertSame(1, $count('?search='.urlencode('100%_web')));   // comodines escapados: no coincide "100xyweb"
        $this->assertSame(1, $count('?search=erp'));
        $this->assertSame(1, $count('?search=zeta'));                       // por nombre del cliente
        $this->assertSame(3, $count('?customer_id=not-a-uuid&environment=bogus&platform=bogus'));  // inválidos se ignoran
        $this->assertSame(2, count($this->getJson('/api/v1/admin/cloud/projects?page[size]=2')->json('data')));
        $this->assertTrue($this->getJson('/api/v1/admin/cloud/projects?page[size]=2')->json('meta.has_more'));
        $this->getJson('/api/v1/admin/cloud/projects?sort=bogus')->assertStatus(400);

        $acc = fn (string $qs): int => count($this->getJson('/api/v1/admin/cloud/accounts'.$qs)->assertOk()->json('data'));
        $this->assertSame(2, $acc(''));
        $this->assertSame(1, $acc('?platform=azure'));
        $this->assertSame(1, $acc('?customer_id='.$this->customer));
        $this->assertSame(2, $acc('?owner=company'));
        $this->assertSame(0, $acc('?owner=customer'));
        $this->assertSame(1, $acc('?search=zeta'));
        $this->assertSame(2, $this->getJson('/api/v1/admin/cloud/accounts?customer_id='.$this->customer)->json('data.0.projects_count'));

        // Recursos (solo lectura): filtros y sin rutas de escritura.
        $this->resource($p1['id'], 'i-a', ['kind' => 'server', 'monthly_cost_minor' => 3000, 'cost_currency' => 'USD', 'assigned_customer_id' => $this->customer, 'assignment_status' => 'assigned']);
        $this->resource($p1['id'], 'db-b', ['kind' => 'database', 'resource_type' => 'rds', 'monthly_cost_minor' => 1000, 'cost_currency' => 'USD']);
        $this->resource($p3['id'], 'vm-c', ['kind' => 'server', 'resource_type' => 'vm', 'status' => 'stopped', 'monthly_cost_minor' => 2000, 'cost_currency' => 'PEN']);
        $rc = fn (string $qs): int => count($this->getJson('/api/v1/admin/cloud/resources'.$qs)->assertOk()->json('data'));
        $this->assertSame(3, $rc(''));
        $this->assertSame(2, $rc('?cloud_project_id='.$p1['id']));
        $this->assertSame(2, $rc('?kind=server'));
        $this->assertSame(1, $rc('?kind=database'));
        $this->assertSame(1, $rc('?status=stopped'));
        $this->assertSame(1, $rc('?resource_type=rds'));
        $this->assertSame(1, $rc('?customer_id='.$this->customer));
        $this->assertSame(2, $rc('?assignment_status=unassigned'));
        $this->assertSame(1, $rc('?search=vm-'));
        $rid = $this->getJson('/api/v1/admin/cloud/resources?kind=database')->json('data.0.id');
        $this->getJson('/api/v1/admin/cloud/resources/'.$rid)->assertOk()->assertJsonPath('data.monthly_cost_minor', 1000)->assertJsonPath('data.project.name', $p1['name']);
        $this->patchJson('/api/v1/admin/cloud/resources/'.$rid, ['name' => 'x'])->assertStatus(405);
        $this->deleteJson('/api/v1/admin/cloud/resources/'.$rid)->assertStatus(405);
        $this->postJson('/api/v1/admin/cloud/resources', [])->assertStatus(405);

        // Resumen: contadores exactos.
        $s = $this->getJson('/api/v1/admin/cloud/summary')->assertOk()->json('data');
        $this->assertSame(2, $s['accounts_total']);
        $this->assertSame(2, $s['accounts_active']);
        $this->assertSame(3, $s['projects_total']);
        $this->assertSame(1, $s['projects_hidden']);
        $this->assertSame(3, $s['resources_total']);
        $this->assertSame(2, $s['resources_unassigned']);
        $this->assertSame([['currency' => 'PEN', 'monthly_minor' => 2000], ['currency' => 'USD', 'monthly_minor' => 4000]], $s['monthly_cost_by_currency']);
        $this->assertSame($month, $s['budget_month']);
        $this->assertSame([['currency' => 'USD', 'budget_minor' => 5000, 'actual_minor' => 1600, 'over_budget' => 1]], $s['budget_by_currency']);
        $this->assertSame(1, $s['over_budget_projects']);
    }

    public function test_organization_isolation_and_idor(): void
    {
        $mine = $this->account();
        $myProject = $this->project($mine['id']);
        $myBudget = $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $myProject['id'], 'period_month' => '2026-01', 'amount_minor' => 10, 'cost_currency' => 'USD'])->assertCreated()->json('data');

        $other = $this->otherOrgId();
        $otherCustomer = (string) Str::uuid();
        DB::table('customers')->insert(['id' => $otherCustomer, 'organization_id' => $other, 'code' => 'CLI-OTRA1', 'type' => 'company', 'legal_name' => 'Ajena SAC', 'normalized_name' => 'ajena sac', 'origin_brand_id' => $this->brand, 'country' => 'PE', 'currency' => 'PEN']);
        $otherPa = $this->providerAccount($other);
        $otherFile = $this->file($other);
        $otherAccount = (string) Str::uuid();
        DB::table('cloud_accounts')->insert(['id' => $otherAccount, 'organization_id' => $other, 'provider_account_id' => $otherPa, 'platform' => 'aws', 'external_account_id' => 'ajena-1', 'owner' => 'company', 'modality' => 'shared_saas']);
        $otherProject = (string) Str::uuid();
        DB::table('cloud_projects')->insert(['id' => $otherProject, 'organization_id' => $other, 'cloud_account_id' => $otherAccount, 'name' => 'Proyecto ajeno']);
        $otherResource = (string) Str::uuid();
        DB::table('cloud_resources')->insert(['id' => $otherResource, 'organization_id' => $other, 'cloud_project_id' => $otherProject, 'resource_type' => 'ec2', 'external_id' => 'ajeno-i']);
        $otherBudget = (string) Str::uuid();
        DB::table('cloud_budgets')->insert(['id' => $otherBudget, 'organization_id' => $other, 'cloud_project_id' => $otherProject, 'period_month' => '2026-01-01', 'amount_minor' => 10, 'cost_currency' => 'USD']);

        // Los listados no ven lo ajeno; el resumen tampoco.
        $this->assertCount(1, $this->getJson('/api/v1/admin/cloud/accounts')->json('data'));
        $this->assertCount(1, $this->getJson('/api/v1/admin/cloud/projects')->json('data'));
        $this->assertCount(0, $this->getJson('/api/v1/admin/cloud/resources')->json('data'));
        $this->assertCount(1, $this->getJson('/api/v1/admin/cloud/budgets')->json('data'));
        $this->assertSame(1, $this->getJson('/api/v1/admin/cloud/summary')->json('data.projects_total'));
        $this->assertCount(0, $this->getJson('/api/v1/admin/cloud/resources?cloud_project_id='.$otherProject)->json('data'));

        // IDOR: ver/editar/borrar lo ajeno es 404 (no 403).
        $this->getJson('/api/v1/admin/cloud/accounts/'.$otherAccount)->assertNotFound();
        $this->patchJson('/api/v1/admin/cloud/accounts/'.$otherAccount, ['version' => 1, 'tagging_status' => 'done'])->assertNotFound();
        $this->deleteJson('/api/v1/admin/cloud/accounts/'.$otherAccount)->assertNotFound();
        $this->getJson('/api/v1/admin/cloud/projects/'.$otherProject)->assertNotFound();
        $this->patchJson('/api/v1/admin/cloud/projects/'.$otherProject, ['version' => 1, 'name' => 'x'])->assertNotFound();
        $this->deleteJson('/api/v1/admin/cloud/projects/'.$otherProject)->assertNotFound();
        $this->getJson('/api/v1/admin/cloud/resources/'.$otherResource)->assertNotFound();
        $this->getJson('/api/v1/admin/cloud/budgets/'.$otherBudget)->assertNotFound();
        $this->patchJson('/api/v1/admin/cloud/budgets/'.$otherBudget, ['version' => 1, 'actual_minor' => 1])->assertNotFound();
        $this->deleteJson('/api/v1/admin/cloud/budgets/'.$otherBudget)->assertNotFound();
        $this->assertSame(1, DB::table('cloud_budgets')->where('id', $otherBudget)->count());

        // Vínculos de otra organización: 404 al crear/editar.
        $base = ['platform' => 'aws', 'external_account_id' => 'zz-1', 'owner' => 'company', 'modality' => 'shared_saas'];
        $this->postJson('/api/v1/admin/cloud/accounts', $base + ['provider_account_id' => $this->providerAccount($other)])->assertNotFound();
        $this->postJson('/api/v1/admin/cloud/accounts', $base + ['provider_account_id' => $this->providerAccount(), 'customer_id' => $otherCustomer])->assertNotFound();
        $this->postJson('/api/v1/admin/cloud/accounts', ['owner' => 'customer', 'customer_id' => $this->customer, 'authorization_file_id' => $otherFile, 'modality' => 'managed_customer_account'] + $base + ['provider_account_id' => $this->providerAccount()])->assertNotFound();
        $this->postJson('/api/v1/admin/cloud/projects', ['cloud_account_id' => $otherAccount, 'name' => 'x'])->assertNotFound();
        $this->postJson('/api/v1/admin/cloud/projects', ['cloud_account_id' => $mine['id'], 'name' => 'x', 'customer_id' => $otherCustomer])->assertNotFound();
        $this->patchJson('/api/v1/admin/cloud/projects/'.$myProject['id'], ['version' => 1, 'cloud_account_id' => $otherAccount])->assertNotFound();
        $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $otherProject, 'period_month' => '2026-02', 'amount_minor' => 1, 'cost_currency' => 'USD'])->assertNotFound();
        $this->assertSame(0, DB::table('cloud_budgets')->where('cloud_project_id', $otherProject)->where('period_month', '2026-02-01')->count());
        $this->assertNotNull($myBudget['id']);
    }

    public function test_authentication_and_permissions(): void
    {
        $account = $this->account();
        $project = $this->project($account['id']);
        $budget = $this->postJson('/api/v1/admin/cloud/budgets', ['cloud_project_id' => $project['id'], 'period_month' => '2026-01', 'amount_minor' => 10, 'cost_currency' => 'USD'])->assertCreated()->json('data');
        $resource = $this->resource($project['id'], 'perm-i');
        $a = '/api/v1/admin/cloud/accounts';
        $p = '/api/v1/admin/cloud/projects';
        $r = '/api/v1/admin/cloud/resources';
        $b = '/api/v1/admin/cloud/budgets';
        $s = '/api/v1/admin/cloud/summary';

        // Sin sesión: 401.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        foreach ([$a, $p, $r, $b, $s] as $url) { $this->getJson($url)->assertUnauthorized(); }
        $this->postJson($a, [])->assertUnauthorized();
        $this->deleteJson("{$p}/{$project['id']}")->assertUnauthorized();

        // Cliente del portal (no staff): 403.
        $this->actAs($this->makeUser([], mfa: true, type: 'customer'));
        $this->getJson($p)->assertForbidden();

        // Ventas no tiene permisos cloud: todo 403.
        $this->actAs($this->makeUser(['sales'], mfa: true));
        foreach ([$a, $p, $r, $b, $s, "{$a}/{$account['id']}", "{$p}/{$project['id']}", "{$r}/{$resource}", "{$b}/{$budget['id']}"] as $url) {
            $this->assertProblem($this->getJson($url), 403, 'forbidden');
        }
        $this->postJson($p, ['cloud_account_id' => $account['id'], 'name' => 'x'])->assertForbidden();

        // Finanzas solo ve presupuestos: lectura de presupuestos sí, el resto 403 y sin escritura.
        $this->actAs($this->makeUser(['finance'], mfa: true));
        $this->getJson($b)->assertOk();
        $this->getJson("{$b}/{$budget['id']}")->assertOk();
        $this->getJson($p)->assertForbidden();
        $this->getJson($a)->assertForbidden();
        $this->patchJson("{$b}/{$budget['id']}", ['version' => 1, 'actual_minor' => 1])->assertForbidden();
        $this->deleteJson("{$b}/{$budget['id']}")->assertForbidden();

        // Soporte (cloud.*): todo permitido. Solo lectura (cloud.*.view): lee pero no escribe.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->getJson($p)->assertOk();
        $this->getJson($s)->assertOk();
        $this->getJson($r)->assertOk();
    }

    public function test_view_only_role_cannot_write(): void
    {
        $account = $this->account();
        $project = $this->project($account['id']);
        $viewer = $this->makeUser([], mfa: true);
        $roleId = (string) DB::table('roles')->where('code', 'documentation')->value('id');
        if ($roleId === '') {
            $this->markTestSkipped('No existe un rol de solo lectura con cloud.*.view en los seeds.');
        }
        $viewer->roles()->attach($roleId, ['organization_id' => $viewer->organization_id]);
        $this->actAs($viewer);
        $this->getJson('/api/v1/admin/cloud/projects')->assertOk();
        $this->getJson('/api/v1/admin/cloud/accounts')->assertOk();
        $this->postJson('/api/v1/admin/cloud/projects', ['cloud_account_id' => $account['id'], 'name' => 'x'])->assertForbidden();
        $this->patchJson('/api/v1/admin/cloud/projects/'.$project['id'], ['version' => 1, 'name' => 'x'])->assertForbidden();
        $this->deleteJson('/api/v1/admin/cloud/projects/'.$project['id'])->assertForbidden();
    }
}
