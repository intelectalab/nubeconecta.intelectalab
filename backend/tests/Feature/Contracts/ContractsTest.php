<?php

declare(strict_types=1);

namespace Tests\Feature\Contracts;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class ContractsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;
    private string $brand;
    private string $customer;
    private int $key = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Contratos SAC', 'tax_id' => '20000000171'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'contratostest', 'name' => 'Contratos Test', 'portal_domain' => 'contratos.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Contratos SAC', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
    }

    private function key(): array { return ['Idempotency-Key' => 'contract-test-'.(++$this->key).'-'.Str::random(8)]; }

    private function create(): array
    {
        return $this->postJson('/api/v1/admin/contracts', ['customer_id' => $this->customer, 'brand_id' => $this->brand, 'currency' => 'PEN', 'starts_on' => '2026-01-01', 'ends_on' => '2026-12-31', 'management_fee_percent' => 5, 'included_hours' => 10, 'body' => 'Texto original del contrato', 'variables' => ['cliente' => 'Cliente Contratos'], 'clause_ids' => [Str::uuid()->toString()]], $this->key())->assertCreated()->json('data');
    }

    public function test_create_and_edit_draft_contract(): void
    {
        $contract = $this->create();
        $this->assertMatchesRegularExpression('/^CTR-\d{6}$/', $contract['number']);
        $this->assertSame('draft', $contract['status']);
        $this->assertSame(1, $contract['current_version']);
        $this->assertSame('original', $contract['current_version_data']['kind']);
        $this->assertSame('Texto original del contrato', $contract['current_version_data']['body']);
        $this->assertSame(1, DB::table('contract_versions')->where('contract_id', $contract['id'])->count());

        $this->patchJson('/api/v1/admin/contracts/'.$contract['id'], ['version' => $contract['version'], 'body' => 'Texto editado'])->assertOk()
            ->assertJsonPath('data.current_version', 1)->assertJsonPath('data.current_version_data.body', 'Texto editado');
        $this->assertSame(1, DB::table('contract_versions')->where('contract_id', $contract['id'])->count());
    }

    public function test_full_state_machine_signing_addendum_and_termination(): void
    {
        $contract = $this->create();
        $this->assertProblem($this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/approve', ['version' => 1]), 422, 'validation_failed');
        $this->assertProblem($this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/sign', ['version' => 1]), 422, 'validation_failed');
        $contract = $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/submit', ['version' => $contract['version']])->assertOk()->json('data');
        $contract = $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/approve', ['version' => $contract['version']])->assertOk()->assertJsonPath('data.status', 'approved')->json('data');
        $contract = $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/send', ['version' => $contract['version']])->assertOk()->assertJsonPath('data.status', 'sent')->json('data');
        $contract = $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/sign', ['version' => $contract['version']])->assertOk()->assertJsonPath('data.status', 'signed_active')->json('data');
        $this->assertNotNull($contract['current_version_data']['locked_at']);
        $this->assertProblem($this->patchJson('/api/v1/admin/contracts/'.$contract['id'], ['version' => $contract['version'], 'body' => 'No editar firmado']), 409, 'invalid_transition');
        $contract = $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/addenda', ['version' => $contract['version'], 'body' => 'Texto de adenda', 'change_summary' => 'Ajuste de alcance'])->assertOk()
            ->assertJsonPath('data.current_version', 2)->assertJsonPath('data.current_version_data.kind', 'addendum')->json('data');
        $this->assertSame('signed_active', $contract['status']);
        $this->assertSame(2, DB::table('contract_versions')->where('contract_id', $contract['id'])->count());
        $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/terminate', ['version' => $contract['version'], 'reason' => 'Fin del servicio'])->assertOk()
            ->assertJsonPath('data.status', 'terminated')->assertJsonPath('data.termination_reason', 'Fin del servicio');
    }

    public function test_addendum_requires_signed_active_and_approve_permission(): void
    {
        $contract = $this->create();
        $this->assertProblem($this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/addenda', ['version' => 1, 'body' => 'Adenda', 'change_summary' => 'Cambio']), 422, 'validation_failed');
        $this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/submit', ['version' => 1])->assertOk();
        $this->actingAs($this->makeUser(['support'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/contracts/'.$contract['id'].'/approve', ['version' => 2]), 403, 'forbidden');
    }

    public function test_organization_isolation(): void
    {
        $contract = $this->create();
        $otherOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $otherOrg, 'name' => 'Otra organización contractual', 'slug' => 'otra-contractual']);
        $otherId = (string) Str::uuid();
        DB::table('contracts')->insert(['id' => $otherId, 'organization_id' => $otherOrg, 'number' => 'CTR-999999', 'customer_id' => $this->customer, 'brand_id' => $this->brand, 'currency' => 'PEN']);
        $this->getJson('/api/v1/admin/contracts/'.$otherId)->assertNotFound();
        $this->getJson('/api/v1/admin/contracts/'.$contract['id'])->assertOk();
    }
}
