<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Comprueba la administración de complementos de producto con precio propio. */
final class ProductAddonsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $product;

    private string $addonProduct;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);

        $category = $this->postJson('/api/v1/admin/product-categories', [
            'code' => 'hosting', 'name' => 'Hosting compartido', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting',
        ])->assertCreated()->json('data.id');
        $this->product = $this->postJson('/api/v1/admin/products', [
            'code' => 'HOST-BASE', 'category_id' => $category, 'name' => 'Hosting base', 'billing_type' => 'recurring',
        ])->assertCreated()->json('data.id');
        $this->addonProduct = $this->postJson('/api/v1/admin/products', [
            'code' => 'HOST-BACKUP', 'category_id' => $category, 'name' => 'Respaldos', 'billing_type' => 'recurring',
        ])->assertCreated()->json('data.id');
    }

    public function test_it_attaches_lists_updates_and_removes_a_product_addon(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/addons";
        $attached = $this->postJson($path, ['addon_product_id' => $this->addonProduct])
            ->assertCreated()
            ->assertJsonPath('data.addon_product_id', $this->addonProduct)
            ->assertJsonPath('data.addon_product_name', 'Respaldos')
            ->assertJsonPath('data.is_required', false)
            ->assertJsonPath('data.version', 1)
            ->json('data');

        $this->getJson($path)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $attached['id']);
        $this->patchJson("{$path}/{$attached['id']}", ['version' => 1, 'is_required' => true])
            ->assertOk()->assertJsonPath('data.is_required', true)->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("{$path}/{$attached['id']}", ['version' => 1, 'is_required' => false]), 409, 'version_conflict');

        $this->deleteJson("{$path}/{$attached['id']}")->assertNoContent();
        $this->assertDatabaseMissing('product_addons', ['id' => $attached['id']]);
        $this->getJson($path)->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_it_rejects_missing_self_and_duplicate_addon_products(): void
    {
        $path = "/api/v1/admin/products/{$this->product}/addons";
        $this->assertProblem($this->postJson($path, ['addon_product_id' => (string) Str::uuid()]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($path, ['addon_product_id' => $this->product]), 422, 'validation_failed');

        $this->postJson($path, ['addon_product_id' => $this->addonProduct])->assertCreated();
        $this->assertProblem($this->postJson($path, ['addon_product_id' => $this->addonProduct]), 422, 'validation_failed');
    }
}
