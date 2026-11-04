<?php

declare(strict_types=1);

namespace Tests\Feature\Sales;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class QuotesTest extends IdentityTestCase
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
        $org = DB::table('organizations')->value('id');
        DB::table('tax_rates')->insert(['organization_id' => $org, 'code' => 'igv', 'name' => 'IGV', 'rate_percent' => '18.0000', 'effective_from' => '2011-03-01']);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Cotizaciones SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'cotizaciones', 'name' => 'Cotizaciones', 'portal_domain' => 'cotizaciones.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Cotizaciones SAC', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
    }

    private function key(): array { return ['Idempotency-Key' => 'quote-test-'.(++$this->key).'-'.Str::random(8)]; }

    /** @param list<array<string, mixed>>|null $items @return array<string, mixed> */
    private function create(?array $items = null): array
    {
        return $this->postJson('/api/v1/admin/quotes', [
            'brand_id' => $this->brand, 'customer_id' => $this->customer, 'currency' => 'PEN',
            'items' => $items ?? [
                ['description' => 'Configuración', 'charge_type' => 'one_time', 'quantity' => '1.5', 'unit_price_minor' => 10000],
                ['description' => 'Servicio mensual', 'charge_type' => 'recurring', 'cycle' => 'monthly', 'quantity' => '2', 'unit_price_minor' => 5000, 'discount_minor' => 1000],
            ],
        ], $this->key())->assertCreated()->json('data');
    }

    public function test_create_quote_calculates_frozen_totals_and_number(): void
    {
        $quote = $this->create();
        $this->assertMatchesRegularExpression('/^COT-\d{6}$/', $quote['number']);
        $this->assertSame('draft', $quote['status']);
        $this->assertSame(1, $quote['current_version']);
        $this->assertSame(15000, $quote['current_version_data']['one_time_total_minor']);
        $this->assertSame(9000, $quote['current_version_data']['recurring_total_minor']);
        $this->assertSame(4320, $quote['current_version_data']['tax_minor']);
        $this->assertSame([15000, 9000], array_column($quote['current_version_data']['items'], 'total_minor'));
        $this->assertSame(1, DB::table('quote_versions')->where('quote_id', $quote['id'])->count());
    }

    public function test_editing_draft_creates_new_version_and_preserves_history(): void
    {
        $quote = $this->create();
        $this->patchJson('/api/v1/admin/quotes/'.$quote['id'], [
            'version' => $quote['version'], 'change_note' => 'Ajuste del cliente', 'terms' => 'Vigencia comercial',
            'items' => [['description' => 'Implementación', 'charge_type' => 'one_time', 'quantity' => '2', 'unit_price_minor' => 2500]],
        ])->assertOk()->assertJsonPath('data.current_version', 2)->assertJsonPath('data.current_version_data.version_number', 2)
            ->assertJsonPath('data.current_version_data.change_note', 'Ajuste del cliente')->assertJsonPath('data.current_version_data.one_time_total_minor', 5000)
            ->assertJsonPath('data.current_version_data.tax_minor', 900);
        $this->assertSame(2, DB::table('quote_versions')->where('quote_id', $quote['id'])->count());
        // Historial append-only: v1 conserva sus 2 items y v2 agrega 1 => 3 en total.
        $this->assertSame(3, DB::table('quote_items')->whereIn('quote_version_id', DB::table('quote_versions')->where('quote_id', $quote['id'])->select('id'))->count());
    }

    public function test_status_transitions_reject_invalid_edits_and_skips(): void
    {
        $quote = $this->create();
        $this->assertProblem($this->postJson('/api/v1/admin/quotes/'.$quote['id'].'/accept', ['version' => 1]), 422, 'validation_failed');
        $this->postJson('/api/v1/admin/quotes/'.$quote['id'].'/send', ['version' => 1])->assertOk()->assertJsonPath('data.status', 'sent');
        $this->assertProblem($this->patchJson('/api/v1/admin/quotes/'.$quote['id'], ['version' => 2, 'items' => [['description' => 'X', 'charge_type' => 'one_time', 'quantity' => 1, 'unit_price_minor' => 0]]]), 409, 'invalid_transition');

        $accepted = $this->create([['description' => 'Servicio', 'charge_type' => 'one_time', 'quantity' => 1, 'unit_price_minor' => 100]]) ;
        $this->postJson('/api/v1/admin/quotes/'.$accepted['id'].'/send', ['version' => 1])->assertOk();
        $this->postJson('/api/v1/admin/quotes/'.$accepted['id'].'/accept', ['version' => 2])->assertOk()->assertJsonPath('data.status', 'accepted');

        $rejected = $this->create([['description' => 'Servicio', 'charge_type' => 'one_time', 'quantity' => 1, 'unit_price_minor' => 100]]);
        $this->postJson('/api/v1/admin/quotes/'.$rejected['id'].'/send', ['version' => 1])->assertOk();
        $this->postJson('/api/v1/admin/quotes/'.$rejected['id'].'/reject', ['version' => 2, 'reason' => 'Precio fuera de presupuesto'])->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.rejection_reason', 'Precio fuera de presupuesto');
    }

    public function test_permissions_and_organization_isolation(): void
    {
        $quote = $this->create();
        $support = $this->makeUser(['support'], mfa: true);
        $this->actingAs($support);
        $this->getJson('/api/v1/admin/quotes/'.$quote['id'])->assertOk();
        $this->assertProblem($this->postJson('/api/v1/admin/quotes', ['brand_id' => $this->brand, 'customer_id' => $this->customer, 'currency' => 'PEN', 'items' => [['description' => 'X', 'charge_type' => 'one_time', 'quantity' => 1, 'unit_price_minor' => 1]]], $this->key()), 403, 'forbidden');

        $otherOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $otherOrg, 'name' => 'Otra organización', 'slug' => 'otra-cotizacion']);
        $otherId = (string) Str::uuid();
        DB::table('quotes')->insert(['id' => $otherId, 'organization_id' => $otherOrg, 'number' => 'COT-999999', 'brand_id' => $this->brand, 'customer_id' => $this->customer, 'currency' => 'PEN']);
        $this->actingAs($this->admin);
        $this->assertProblem($this->getJson('/api/v1/admin/quotes/'.$otherId), 404, 'not_found');
    }
}
