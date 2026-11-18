<?php

declare(strict_types=1);

namespace Tests\Feature\Dashboard;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Serie mensual real de los KPIs de flujo: 12 puntos, mes actual, moneda, permisos y organización. */
final class KpiSeriesTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private string $org;

    private string $entity;

    private string $brand;

    private string $customer;

    private string $method;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actAs($this->makeUser(['admin'], mfa: true));
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Serie SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'ks', 'name' => 'Ks', 'portal_domain' => 'portal.ks.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Serie SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->method = (string) Str::uuid();
        DB::table('payment_methods')->insert(['id' => $this->method, 'organization_id' => $this->org, 'code' => 'ks-bt', 'name' => 'Transf', 'kind' => 'bank_transfer']);
        $this->travelTo(now()->utc()->startOfMonth()->addDays(14)->setTime(12, 0));
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function payment(int $amount, string $at, string $currency = 'PEN', ?string $org = null): void
    {
        $n = ++$this->seq;
        DB::table('payments')->insert([
            'organization_id' => $org ?? $this->org, 'customer_id' => $this->customer, 'payment_method_id' => $this->method, 'status' => 'validated',
            'amount_minor' => $amount, 'currency' => $currency, 'reported_via' => 'finance', 'external_id' => "s-{$n}", 'received_at' => $at,
            'validated_at' => $at, 'validated_by' => User::query()->value('id'),
        ]);
    }

    private function invoice(string $issue, int $total): void
    {
        $n = ++$this->seq;
        DB::table('invoices')->insert([
            'organization_id' => $this->org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $this->customer,
            'type' => 'invoice', 'status' => 'issued', 'series' => 'F001', 'number' => $n, 'currency' => 'PEN',
            'issue_date' => $issue, 'issued_at' => $issue, 'due_date' => $issue,
            'subtotal_minor' => $total, 'total_minor' => $total, 'balance_minor' => $total,
        ]);
    }

    public function test_facturado_and_cobrado_return_twelve_months_ending_now(): void
    {
        $this->invoice(now()->toDateString(), 10000);
        $this->invoice(now()->toDateString(), 5050);
        $this->invoice(now()->subMonths(2)->toDateString(), 2000);
        $this->invoice(now()->subMonths(13)->toDateString(), 9999); // fuera de ventana
        $this->payment(7000, now()->toDateTimeString());
        $this->payment(3000, now()->subMonth()->toDateTimeString());

        $f = $this->getJson('/api/v1/admin/kpis/series?id=facturado')->assertOk()->json('data');
        $this->assertSame('facturado', $f['id']);
        $this->assertSame('PEN', $f['currency']);
        $this->assertCount(12, $f['points']);
        $this->assertSame(now()->utc()->format('Y-m'), $f['points'][11]['month']);
        $this->assertSame(now()->utc()->startOfMonth()->subMonths(11)->format('Y-m'), $f['points'][0]['month']);
        $this->assertEqualsWithDelta(150.5, $f['points'][11]['value'], 0.001);
        $this->assertEqualsWithDelta(20.0, $f['points'][9]['value'], 0.001);
        $this->assertEqualsWithDelta(0.0, $f['points'][10]['value'], 0.001);

        $c = $this->getJson('/api/v1/admin/kpis/series?id=cobrado')->assertOk()->json('data');
        $this->assertCount(12, $c['points']);
        $this->assertEqualsWithDelta(70.0, $c['points'][11]['value'], 0.001);
        $this->assertEqualsWithDelta(30.0, $c['points'][10]['value'], 0.001);

        $v = $this->getJson('/api/v1/admin/kpis/series?id=vouch')->assertOk()->json('data');
        $this->assertSame(1, $v['points'][11]['value']);
        $this->assertArrayNotHasKey('currency', $v);

        $this->getJson('/api/v1/admin/kpis/series?id=ganados')->assertOk()->assertJsonCount(12, 'data.points');
    }

    public function test_stock_or_unknown_id_has_no_series(): void
    {
        foreach (['embudo', 'tkab', 'nope'] as $id) {
            $this->assertProblem($this->getJson("/api/v1/admin/kpis/series?id={$id}"), 404, 'no_series');
        }
    }

    public function test_mrr_series_is_estimated(): void
    {
        $this->getJson('/api/v1/admin/kpis/series?id=mrr')->assertOk()
            ->assertJsonPath('data.id', 'mrr')
            ->assertJsonPath('data.estimated', true)
            ->assertJsonPath('data.currency', 'PEN')
            ->assertJsonCount(12, 'data.points');
    }

    public function test_other_currency_omits_monetary_series(): void
    {
        $this->payment(1000, now()->toDateTimeString(), 'USD');
        $this->assertProblem($this->getJson('/api/v1/admin/kpis/series?id=cobrado'), 404, 'no_series');
        $this->getJson('/api/v1/admin/kpis/series?id=vouch')->assertOk();
    }

    public function test_denied_without_permission(): void
    {
        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->getJson('/api/v1/admin/kpis/series?id=cobrado')->assertForbidden();
        $this->getJson('/api/v1/admin/kpis/series?id=facturado')->assertForbidden();
    }

    public function test_other_organization_data_is_not_counted(): void
    {
        $other = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $other, 'name' => 'Otra', 'slug' => 'otra-serie']);
        $this->payment(5000, now()->toDateTimeString(), 'PEN', $other);

        $c = $this->getJson('/api/v1/admin/kpis/series?id=cobrado')->assertOk()->json('data');
        $this->assertEqualsWithDelta(0.0, $c['points'][11]['value'], 0.001);
    }

    public function test_requires_mfa(): void
    {
        $this->actAs($this->makeUser(['admin']));
        $this->assertProblem($this->getJson('/api/v1/admin/kpis/series?id=cobrado'), 403, 'mfa_required');
    }
}
