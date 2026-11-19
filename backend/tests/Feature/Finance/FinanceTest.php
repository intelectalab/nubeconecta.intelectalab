<?php

declare(strict_types=1);

namespace Tests\Feature\Finance;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class FinanceTest extends IdentityTestCase
{
    private User $admin;
    private string $brand;
    private string $service;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Finance SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'finance-test', 'name' => 'Finance Test', 'portal_domain' => 'finance.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Finance SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $org = $this->admin->organization_id;
        $category = (string) Str::uuid(); $product = (string) Str::uuid(); $this->service = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $category, 'organization_id' => $org, 'code' => 'finance-hosting', 'name' => 'Hosting']);
        DB::table('products')->insert(['id' => $product, 'organization_id' => $org, 'code' => 'FIN-H1', 'category_id' => $category, 'name' => 'Finance Hosting', 'billing_type' => 'recurring']);
        DB::table('services')->insert(['id' => $this->service, 'organization_id' => $org, 'code' => 'SRV-FIN-1', 'customer_id' => $customer, 'brand_id' => $this->brand, 'product_id' => $product, 'label' => 'finance.example']);
    }

    public function test_cost_creation_normalizes_period_month(): void
    {
        $this->postJson('/api/v1/admin/costs', $this->costPayload(['period_month' => '2026-03-15']))->assertCreated()->assertJsonPath('data.period_month', '2026-03-01');
    }

    public function test_allocation_requires_cost_currency_and_respects_cost_limit(): void
    {
        $cost = $this->createCost(1000);
        $this->assertProblem($this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['cost_currency' => 'USD'])), 422, 'validation_failed');
        $this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['amount_minor' => 700]))->assertCreated();
        $otherService = $this->createAdditionalService();
        $this->assertProblem($this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['service_id' => $otherService, 'amount_minor' => 301])), 422, 'validation_failed');
    }

    public function test_duplicate_cost_service_allocation_returns_validation_error(): void
    {
        $cost = $this->createCost(1000);
        $this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['amount_minor' => 300]))->assertCreated();
        $this->assertProblem($this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['amount_minor' => 300])), 422, 'validation_failed');
    }

    public function test_update_rejects_stale_version(): void
    {
        $cost = $this->createCost(1000);
        $this->assertProblem($this->patchJson("/api/v1/admin/costs/{$cost}", ['version' => 99, 'description' => 'Actualizado']), 409, 'version_conflict');
    }

    public function test_profitability_sums_allocated_costs_for_service_and_period(): void
    {
        foreach ([400, 650] as $amount) {
            $cost = $this->createCost($amount);
            $this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['amount_minor' => $amount]))->assertCreated();
        }
        // Sin suscripciones: ingreso 0, margen negativo, margen % nulo.
        $this->getJson('/api/v1/admin/finance/profitability?period_month=2026-03-01')->assertOk()
            ->assertJsonPath('data.0.service_id', $this->service)
            ->assertJsonPath('data.0.allocated_cost_minor', 1050)
            ->assertJsonPath('data.0.revenue_minor', 0)
            ->assertJsonPath('data.0.margin_minor', -1050)
            ->assertJsonPath('data.0.margin_pct', null)
            ->assertJsonPath('data.0.currency', 'PEN')
            ->assertJsonPath('totals.0.allocated_cost_minor', 1050)
            ->assertJsonPath('totals.0.revenue_minor', 0);
    }

    public function test_profitability_includes_monthly_normalized_subscription_revenue_and_margin(): void
    {
        // Suscripción mensual S/100 activa en el periodo + costo asignado S/40 → margen S/60 (60%).
        DB::table('subscriptions')->insert([
            'id' => (string) Str::uuid(), 'organization_id' => $this->admin->organization_id, 'service_id' => $this->service,
            'cycle' => 'monthly', 'quantity' => 1, 'price_minor' => 10000, 'currency' => 'PEN',
            'next_invoice_date' => '2026-04-01', 'starts_on' => '2026-01-01', 'status' => 'active',
            'version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $cost = $this->createCost(4000);
        $this->postJson('/api/v1/admin/cost-allocations', $this->allocationPayload($cost, ['amount_minor' => 4000]))->assertCreated();

        $this->getJson('/api/v1/admin/finance/profitability?period_month=2026-03-01')->assertOk()
            ->assertJsonPath('data.0.service_id', $this->service)
            ->assertJsonPath('data.0.revenue_minor', 10000)
            ->assertJsonPath('data.0.allocated_cost_minor', 4000)
            ->assertJsonPath('data.0.margin_minor', 6000)
            ->assertJsonPath('data.0.margin_pct', 60)
            ->assertJsonPath('data.0.currency', 'PEN')
            ->assertJsonPath('totals.0.revenue_minor', 10000)
            ->assertJsonPath('totals.0.margin_minor', 6000);
    }

    public function test_profitability_annual_subscription_is_normalized_to_monthly(): void
    {
        // Suscripción anual S/1200 → equivalente mensual S/100.
        DB::table('subscriptions')->insert([
            'id' => (string) Str::uuid(), 'organization_id' => $this->admin->organization_id, 'service_id' => $this->service,
            'cycle' => 'annual', 'quantity' => 1, 'price_minor' => 120000, 'currency' => 'PEN',
            'next_invoice_date' => '2027-01-01', 'starts_on' => '2026-01-01', 'status' => 'active',
            'version' => 1, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->getJson('/api/v1/admin/finance/profitability?period_month=2026-03-01')->assertOk()
            ->assertJsonPath('data.0.revenue_minor', 10000);
    }

    public function test_costs_are_isolated_by_organization(): void
    {
        $foreignOrg = (string) Str::uuid(); $id = (string) Str::uuid(); $now = now();
        DB::table('organizations')->insert(['id' => $foreignOrg, 'name' => 'Otra org Finance', 'slug' => 'otra-org-finance']);
        DB::table('costs')->insert(['id' => $id, 'organization_id' => $foreignOrg, 'kind' => 'other', 'period_month' => '2026-03-01', 'amount_minor' => 10, 'cost_currency' => 'PEN', 'allocation_method' => 'manual', 'version' => 1, 'created_at' => $now, 'updated_at' => $now]);
        $this->getJson("/api/v1/admin/costs/{$id}")->assertNotFound();
    }

    public function test_sales_role_cannot_create_cost(): void
    {
        $this->flushSession(); $this->app['auth']->forgetGuards(); $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/costs', $this->costPayload()), 403, 'forbidden');
    }

    private function createCost(int $amount): string
    {
        return $this->postJson('/api/v1/admin/costs', $this->costPayload(['amount_minor' => $amount]))->assertCreated()->json('data.id');
    }

    private function createAdditionalService(): string
    {
        $service = (string) Str::uuid();
        $existing = DB::table('services')->where('id', $this->service)->first();
        DB::table('services')->insert(['id' => $service, 'organization_id' => $this->admin->organization_id, 'code' => 'SRV-FIN-'.Str::upper(Str::random(6)), 'customer_id' => $existing->customer_id, 'brand_id' => $existing->brand_id, 'product_id' => $existing->product_id, 'label' => 'finance-other.example']);
        return $service;
    }

    private function costPayload(array $extra = []): array
    {
        return $extra + ['kind' => 'other', 'period_month' => '2026-03-01', 'amount_minor' => 1000, 'cost_currency' => 'PEN', 'allocation_method' => 'manual', 'description' => 'Infraestructura'];
    }

    private function allocationPayload(string $cost, array $extra = []): array
    {
        return $extra + ['cost_id' => $cost, 'service_id' => $this->service, 'amount_minor' => 1000, 'cost_currency' => 'PEN', 'basis' => []];
    }
}
