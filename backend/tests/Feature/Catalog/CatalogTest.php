<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Franja MVP de M-CAT: CRUD con permisos y auditoría, precios por moneda y vigencia, demo y vista del plugin. */
final class CatalogTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'alojamientoplus', 'name' => 'AlojamientoPlus', 'portal_domain' => 'portal.ap.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    /** @return array{category: string, product: string, plan: string} */
    private function catalog(): array
    {
        $category = $this->postJson('/api/v1/admin/product-categories', ['code' => 'hosting', 'name' => 'Hosting compartido', 'kind' => 'shared_hosting', 'shortcode_type' => 'hosting'])->assertCreated()->json('data.id');
        $product = $this->postJson('/api/v1/admin/products', ['code' => 'HOST-PYME', 'category_id' => $category, 'brand_id' => $this->brand, 'name' => 'Hosting Pyme', 'billing_type' => 'recurring', 'sellable_online' => true])->assertCreated()->json('data.id');
        $plan = $this->postJson('/api/v1/admin/plans', ['product_id' => $product, 'code' => 'host-pyme-m', 'name' => 'Pyme mensual', 'cycle' => 'monthly', 'cost_minor' => 500, 'cost_currency' => 'USD'])->assertCreated()->json('data.id');

        return compact('category', 'product', 'plan');
    }

    public function test_crud_prices_by_currency_and_validity_with_audit(): void
    {
        ['product' => $product, 'plan' => $plan] = $this->catalog();
        $yesterday = now()->subDay()->toDateString();
        $pen = $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => 3490, 'effective_from' => $yesterday])->assertCreated()->json('data');
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'USD', 'price_minor' => 990, 'effective_from' => $yesterday])->assertCreated();
        $this->assertProblem($this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'EUR', 'price_minor' => 1]), 422, 'validation_failed');

        // Nuevo precio con vigencia futura: cierra la vigencia abierta anterior.
        $next = now()->addDays(10)->toDateString();
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => 3990, 'effective_from' => $next])->assertCreated();
        $this->assertSame($next, DB::table('plan_prices')->where('id', $pen['id'])->value('effective_to'));
        // Superposición con un tramo cerrado → 409; un precio vigente no se edita ni se borra.
        $this->assertProblem($this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => 1, 'effective_from' => now()->toDateString(), 'effective_to' => now()->addDays(20)->toDateString()]), 409, 'price_overlap');
        $this->assertProblem($this->patchJson("/api/v1/admin/plan-prices/{$pen['id']}", ['version' => 2, 'price_minor' => 1]), 409, 'price_in_effect');
        $this->assertProblem($this->deleteJson("/api/v1/admin/plan-prices/{$pen['id']}"), 409, 'price_in_effect');

        $detail = $this->getJson("/api/v1/admin/products/{$product}")->assertOk();
        $this->assertCount(3, $detail->json('data.plans.0.prices'));
        $this->assertSame(500, $detail->json('data.plans.0.cost_minor'));
        $this->getJson("/api/v1/admin/products?filter[brand_id]={$this->brand}&q=pyme")->assertOk()->assertJsonCount(1, 'data');

        // Desactivar con versión; auditoría de cada escritura.
        $this->patchJson("/api/v1/admin/products/{$product}", ['version' => 1, 'is_active' => false])->assertOk()->assertJsonPath('data.is_active', false);
        $this->assertProblem($this->patchJson("/api/v1/admin/products/{$product}", ['version' => 1, 'name' => 'X']), 409, 'version_conflict');
        $actions = DB::table('audit_events')->pluck('action')->all();
        foreach (['product_category.created', 'product.created', 'plan.created', 'plan_price.created', 'plan_price.updated', 'product.updated'] as $action) {
            $this->assertContains($action, $actions);
        }
    }

    public function test_permissions_hide_costs_and_isolate_organizations(): void
    {
        ['category' => $category, 'plan' => $plan] = $this->catalog();
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actAs($sales);
        $this->getJson("/api/v1/admin/plans/{$plan}")->assertOk()->assertJsonMissingPath('data.cost_minor');
        $this->assertProblem($this->postJson('/api/v1/admin/products', ['code' => 'X', 'category_id' => $category, 'name' => 'X', 'billing_type' => 'one_time']), 403, 'forbidden');
        $this->assertProblem($this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => 'PEN', 'price_minor' => 1]), 403, 'forbidden');

        // Producto de otra organización: no existe para esta.
        $other = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $other, 'name' => 'Otra', 'slug' => 'otra']);
        $otherCat = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $otherCat, 'organization_id' => $other, 'code' => 'hosting', 'name' => 'Hosting']);
        $otherProduct = (string) Str::uuid();
        DB::table('products')->insert(['id' => $otherProduct, 'organization_id' => $other, 'code' => 'P', 'category_id' => $otherCat, 'name' => 'Ajeno', 'billing_type' => 'recurring']);
        $this->assertProblem($this->getJson("/api/v1/admin/products/{$otherProduct}"), 404, 'not_found');
        $this->getJson('/api/v1/admin/products')->assertOk()->assertJsonCount(1, 'data');
        $this->actAs($this->admin);
        $this->assertProblem($this->postJson('/api/v1/admin/plans', ['product_id' => $otherProduct, 'code' => 'p1', 'name' => 'P', 'cycle' => 'monthly']), 422, 'validation_failed');
    }

    public function test_demo_catalog_is_idempotent_and_visible_to_the_plugin(): void
    {
        $this->artisan('hub:demo:catalog')->assertSuccessful();
        $counts = fn () => [DB::table('products')->count(), DB::table('plans')->count(), DB::table('plan_prices')->count(), DB::table('product_listings')->count(), DB::table('tax_rates')->count()];
        $first = $counts();
        $this->artisan('hub:demo:catalog')->assertSuccessful();
        $this->assertSame($first, $counts());
        $this->assertSame(1, $first[4]);

        $pyme = DB::table('plans')->where('code', 'demo-hp2-a')->value('id');
        $this->assertSame(34900, (int) DB::table('plan_prices')->where('plan_id', $pyme)->where('currency', 'PEN')->value('price_minor'));
        $this->assertSame($this->brand, DB::table('products')->where('code', 'demo-hp2')->value('brand_id'));
        $this->assertStringContainsString('prototipo', (string) DB::table('products')->where('code', 'demo-hp2')->value('description'));
        $this->assertSame('hour', json_decode((string) DB::table('plans')->where('code', 'like', 'demo-pz-028-%')->value('limits'), true)['billing_unit']);
        $this->assertSame(9500, (int) DB::table('plan_prices')->join('plans', 'plans.id', '=', 'plan_prices.plan_id')->where('plans.code', 'like', 'demo-pz-028-%')->value('price_minor'));

        // El plugin ve el mismo catálogo por /public/wp/catalog.
        $org = DB::table('organizations')->value('id');
        $site = (string) Str::uuid();
        DB::table('wp_sites')->insert(['id' => $site, 'organization_id' => $org, 'brand_id' => $this->brand, 'name' => 'Web AP', 'base_url' => 'https://www.ap.test']);
        $plain = 'demo-token-'.Str::random(20);
        DB::table('wp_site_tokens')->insert(['id' => Str::uuid(), 'organization_id' => $org, 'wp_site_id' => $site, 'name' => 'Plugin', 'token_hash' => hash('sha256', $plain), 'token_last_four' => substr($plain, -4), 'expires_at' => now()->addDay()]);
        $plans = $this->withHeaders(['Authorization' => "Bearer {$plain}", 'X-Hub-Plugin-Version' => '99.0.0'])
            ->getJson('/api/v1/public/wp/catalog/plans?type=hosting&currency=PEN')->assertOk();
        $codes = array_column($plans->json('data'), 'code');
        $this->assertContains('demo-hp2-a', $codes);
        $this->assertNotContains('demo-hp4-a', $codes); // reseller, otra categoría
        $hp2 = collect($plans->json('data'))->firstWhere('code', 'demo-hp2-a');
        $this->assertSame(34900, $hp2['price']['amount_minor']);
        $this->assertTrue($hp2['featured']);
    }
}
