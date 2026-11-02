<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Tests\Feature\Identity\IdentityTestCase;

/** Comprueba el ciclo de vida de una ficha técnica de hosting. */
final class HostingSpecTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $product;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $category = $this->postJson('/api/v1/admin/product-categories', [
            'code' => 'hosting-spec', 'name' => 'Hosting', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting',
        ])->assertCreated()->json('data.id');
        $this->product = $this->postJson('/api/v1/admin/products', [
            'code' => 'HOST-SPEC', 'category_id' => $category, 'name' => 'Hosting ficha', 'billing_type' => 'recurring',
        ])->assertCreated()->json('data.id');
    }

    public function test_it_creates_reads_updates_and_removes_a_hosting_spec(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/hosting-spec";
        $spec = $this->putJson($path, ['whm_package' => 'reseller-basic', 'websites' => 1, 'extra_resources' => ['ssl' => true]])
            ->assertCreated()->assertJsonPath('data.whm_package', 'reseller-basic')
            ->assertJsonPath('data.extra_resources.ssl', true)->assertJsonPath('data.version', 1)->json('data');

        $this->getJson($path)->assertOk()->assertJsonPath('data.id', $spec['id']);
        $this->putJson($path, ['version' => 1, 'whm_package' => 'reseller-pro'])
            ->assertOk()->assertJsonPath('data.whm_package', 'reseller-pro')->assertJsonPath('data.version', 2);
        $this->assertProblem($this->putJson($path, ['version' => 1, 'whm_package' => 'reseller-old']), 409, 'version_conflict');
        $this->deleteJson($path)->assertNoContent();
        $this->assertDatabaseMissing('hosting_package_specs', ['id' => $spec['id']]);
    }

    public function test_it_validates_required_and_range_limited_hosting_fields(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/hosting-spec";
        $this->assertProblem($this->putJson($path, []), 422, 'validation_failed');
        $this->assertProblem($this->putJson($path, ['whm_package' => '   ', 'websites' => 0]), 422, 'validation_failed');
    }
}
