<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use App\Modules\Catalog\Services\PriceResolver;
use Database\Seeders\DatabaseSeeder;
use Tests\Feature\Identity\IdentityTestCase;

final class CatalogPricingTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    /** @return array{product: string, plan: string} */
    private function catalog(): array
    {
        $category = $this->postJson('/api/v1/admin/product-categories', [
            'code' => 'hosting', 'name' => 'Hosting compartido', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting',
        ])->assertCreated()->json('data.id');
        $product = $this->postJson('/api/v1/admin/products', [
            'code' => 'HOST-PYME', 'category_id' => $category, 'name' => 'Hosting Pyme',
            'billing_type' => 'recurring', 'sellable_online' => true,
        ])->assertCreated()->json('data.id');
        $plan = $this->postJson('/api/v1/admin/plans', [
            'product_id' => $product, 'code' => 'host-pyme-m', 'name' => 'Pyme mensual', 'cycle' => 'monthly',
        ])->assertCreated()->json('data.id');

        return compact('product', 'plan');
    }

    public function test_current_plan_price_is_resolved_in_the_requested_currency(): void
    {
        ['plan' => $plan] = $this->catalog();
        $effectiveFrom = now()->subDay()->toDateString();

        $this->postJson('/api/v1/admin/plan-prices', [
            'plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => 3490, 'effective_from' => $effectiveFrom,
        ])->assertCreated()->assertJsonPath('data.currency', 'PEN')->assertJsonPath('data.price_minor', 3490);
        $this->postJson('/api/v1/admin/plan-prices', [
            'plan_id' => $plan, 'currency' => 'USD', 'price_minor' => 990, 'effective_from' => $effectiveFrom,
        ])->assertCreated()->assertJsonPath('data.currency', 'USD')->assertJsonPath('data.price_minor', 990);

        $prices = app(PriceResolver::class);
        $this->assertSame(3490, $prices->current($plan, 'PEN')?->price_minor);
        $this->assertSame(990, $prices->current($plan, 'USD')?->price_minor);
        $this->assertNull($prices->current($plan, 'EUR'));
    }

    public function test_deactivating_plan_removes_it_from_active_plans_and_can_be_reactivated(): void
    {
        ['plan' => $plan] = $this->catalog();

        $this->getJson("/api/v1/admin/plans/{$plan}")->assertOk()->assertJsonPath('data.is_active', true);
        $this->getJson('/api/v1/admin/plans?filter[is_active]=true')->assertOk()->assertJsonFragment(['id' => $plan]);

        $this->patchJson("/api/v1/admin/plans/{$plan}", ['version' => 1, 'is_active' => false])
            ->assertOk()->assertJsonPath('data.is_active', false)->assertJsonPath('data.version', 2);
        $this->getJson('/api/v1/admin/plans?filter[is_active]=true')->assertOk()->assertJsonMissing(['id' => $plan]);
        $this->getJson('/api/v1/admin/plans?filter[is_active]=false')->assertOk()->assertJsonFragment(['id' => $plan]);

        $this->patchJson("/api/v1/admin/plans/{$plan}", ['version' => 2, 'is_active' => true])
            ->assertOk()->assertJsonPath('data.is_active', true)->assertJsonPath('data.version', 3);
        $this->getJson('/api/v1/admin/plans?filter[is_active]=true')->assertOk()->assertJsonFragment(['id' => $plan]);
    }
}
