<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Comprueba la composición de planes paquete con planes componente. */
final class BundleItemsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $bundle;

    private string $component;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);

        $category = $this->postJson('/api/v1/admin/product-categories', [
            'code' => 'bundle-hosting', 'name' => 'Hosting para paquetes', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting',
        ])->assertCreated()->json('data.id');
        $product = $this->postJson('/api/v1/admin/products', [
            'code' => 'BUNDLE-HOST', 'category_id' => $category, 'name' => 'Hosting para paquetes', 'billing_type' => 'recurring',
        ])->assertCreated()->json('data.id');
        $this->bundle = $this->createPlan($product, 'BUNDLE-BASE', 'Paquete base');
        $this->component = $this->createPlan($product, 'BUNDLE-ITEM', 'Plan componente');
    }

    public function test_it_adds_lists_updates_and_removes_a_bundle_component(): void
    {
        $path = "/api/v1/admin/plans/{$this->bundle}/bundle-items";
        $attached = $this->postJson($path, ['item_plan_id' => $this->component])
            ->assertCreated()
            ->assertJsonPath('data.item_plan_id', $this->component)
            ->assertJsonPath('data.item_plan_name', 'Plan componente')
            ->assertJsonPath('data.quantity', '1.000')
            ->assertJsonPath('data.version', 1)
            ->json('data');

        $this->getJson($path)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $attached['id']);
        $this->patchJson("{$path}/{$attached['id']}", ['version' => 1, 'quantity' => 2.5])
            ->assertOk()->assertJsonPath('data.quantity', '2.500')->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("{$path}/{$attached['id']}", ['version' => 1, 'quantity' => 3]), 409, 'version_conflict');

        $this->deleteJson("{$path}/{$attached['id']}")->assertNoContent();
        $this->assertDatabaseMissing('bundle_items', ['id' => $attached['id']]);
        $this->getJson($path)->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_it_rejects_missing_self_duplicate_and_invalid_quantity_components(): void
    {
        $path = "/api/v1/admin/plans/{$this->bundle}/bundle-items";
        $this->assertProblem($this->postJson($path, ['item_plan_id' => (string) Str::uuid()]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($path, ['item_plan_id' => $this->bundle]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($path, ['item_plan_id' => $this->component, 'quantity' => 0]), 422, 'validation_failed');
        $this->assertProblem($this->postJson($path, ['item_plan_id' => $this->component, 'quantity' => -1]), 422, 'validation_failed');

        $this->postJson($path, ['item_plan_id' => $this->component])->assertCreated();
        $this->assertProblem($this->postJson($path, ['item_plan_id' => $this->component]), 422, 'validation_failed');
    }

    private function createPlan(string $product, string $code, string $name): string
    {
        return $this->postJson('/api/v1/admin/plans', [
            'product_id' => $product, 'code' => $code, 'name' => $name, 'cycle' => 'monthly',
        ])->assertCreated()->json('data.id');
    }
}
