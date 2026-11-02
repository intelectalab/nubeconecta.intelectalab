<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Comprueba el ciclo de vida de una ficha VPS, incluido su arreglo text[]. */
final class VpsSpecTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $product;

    private string $provider;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $category = $this->postJson('/api/v1/admin/product-categories', [
            'code' => 'vps-spec', 'name' => 'VPS', 'kind' => 'vps', 'shortcode_type' => 'hosting',
        ])->assertCreated()->json('data.id');
        $this->product = $this->postJson('/api/v1/admin/products', [
            'code' => 'VPS-SPEC', 'category_id' => $category, 'name' => 'VPS ficha', 'billing_type' => 'recurring',
        ])->assertCreated()->json('data.id');
        $this->provider = (string) Str::uuid();
        DB::table('providers')->insert([
            'id' => $this->provider, 'organization_id' => $this->admin->organization_id,
            'code' => 'vps-test', 'name' => 'Proveedor VPS', 'type' => 'hosting',
        ]);
    }

    private function validPayload(): array
    {
        return [
            'vcpu' => 2, 'ram_mb' => 4096, 'disk_gb' => 80, 'transfer_gb' => 1000,
            'os_options' => ['Ubuntu 24.04', 'Debian 13'], 'is_managed' => true,
            'location' => 'Lima', 'cpu_model' => 'EPYC', 'disk_type' => 'nvme',
            'provider_id' => $this->provider, 'provider_plan_ref' => 'small-2c-4g',
        ];
    }

    public function test_it_creates_reads_updates_and_removes_a_vps_spec(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/vps-spec";
        $spec = $this->putJson($path, $this->validPayload())->assertCreated()
            ->assertJsonPath('data.os_options', ['Ubuntu 24.04', 'Debian 13'])
            ->assertJsonPath('data.version', 1)->json('data');
        $this->getJson($path)->assertOk()->assertJsonPath('data.id', $spec['id'])
            ->assertJsonPath('data.os_options', ['Ubuntu 24.04', 'Debian 13']);
        $this->putJson($path, ['version' => 1, 'disk_type' => 'ssd'])
            ->assertOk()->assertJsonPath('data.disk_type', 'ssd')->assertJsonPath('data.version', 2);
        $this->assertProblem($this->putJson($path, ['version' => 1, 'disk_type' => 'hdd']), 409, 'version_conflict');
        $this->deleteJson($path)->assertNoContent();
        $this->assertDatabaseMissing('vps_plan_specs', ['id' => $spec['id']]);
    }

    public function test_it_validates_required_fields_disk_type_and_provider_scope(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/vps-spec";
        $this->assertProblem($this->putJson($path, []), 422, 'validation_failed');
        $payload = $this->validPayload();
        $payload['disk_type'] = 'sas';
        $this->assertProblem($this->putJson($path, $payload), 422, 'validation_failed');
        $payload = $this->validPayload();
        $payload['provider_id'] = (string) Str::uuid();
        $this->assertProblem($this->putJson($path, $payload), 422, 'validation_failed');
    }
}
