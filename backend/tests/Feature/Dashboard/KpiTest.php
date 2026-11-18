<?php

declare(strict_types=1);

namespace Tests\Feature\Dashboard;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Panel de indicadores: valores reales exactos, solo PEN, y omisión de claves sin permiso. */
final class KpiTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private string $org;

    private string $entity;

    private string $brand;

    private string $customer;

    private string $method;

    private string $card;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->actAs($this->makeUser(['admin'], mfa: true));
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Kpi SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'kpi', 'name' => 'Kpi', 'portal_domain' => 'portal.kpi.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Kpi SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->method = (string) Str::uuid();
        $this->card = (string) Str::uuid();
        DB::table('payment_methods')->insert([
            ['id' => $this->method, 'organization_id' => $this->org, 'code' => 'kpi-bt', 'name' => 'Transf', 'kind' => 'bank_transfer'],
            ['id' => $this->card, 'organization_id' => $this->org, 'code' => 'kpi-cg', 'name' => 'Tarjeta', 'kind' => 'card_gateway'],
        ]);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function payment(string $status, string $method, int $amount, string $validatedAt, string $currency = 'PEN'): void
    {
        $n = ++$this->seq;
        DB::table('payments')->insert([
            'organization_id' => $this->org, 'customer_id' => $this->customer, 'payment_method_id' => $method, 'status' => $status,
            'amount_minor' => $amount, 'currency' => $currency, 'reported_via' => 'finance', 'external_id' => "k-{$n}", 'received_at' => $validatedAt,
            'validated_at' => $status === 'validated' ? $validatedAt : null, 'validated_by' => $status === 'validated' ? User::query()->value('id') : null,
        ]);
    }

    private function invoice(string $type, string $status, string $issue, string $due, int $total, int $balance, string $currency = 'PEN'): void
    {
        $n = ++$this->seq;
        DB::table('invoices')->insert([
            'organization_id' => $this->org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $this->customer,
            'type' => $type, 'status' => $status, 'series' => 'F001', 'number' => $n, 'currency' => $currency,
            'issue_date' => $issue, 'issued_at' => $issue, 'due_date' => $due,
            'subtotal_minor' => $total, 'total_minor' => $total, 'balance_minor' => $balance,
        ]);
    }

    private function ticket(string $status): void
    {
        $n = ++$this->seq;
        DB::table('tickets')->insert([
            'organization_id' => $this->org, 'number' => "TK-K{$n}", 'brand_id' => $this->brand, 'channel' => 'portal', 'subject' => "T{$n}", 'status' => $status, 'resolved_at' => in_array($status, ['resolved', 'closed'], true) ? now() : null,
        ]);
    }

    private function lead(string $status, ?int $amount, string $channel, string $stage, ?string $currency = 'PEN', ?string $deletedAt = null): void
    {
        $n = ++$this->seq;
        DB::table('leads')->insert([
            'organization_id' => $this->org, 'code' => "LK-{$n}", 'name' => "Lead {$n}", 'brand_id' => $this->brand, 'lead_channel_id' => $channel,
            'pipeline_stage_id' => $stage, 'status' => $status, 'estimated_amount_minor' => $amount, 'currency' => $currency, 'deleted_at' => $deletedAt,
            'customer_id' => $status === 'won' ? $this->customer : null, 'lost_reason' => $status === 'lost' ? 'x' : null,
            'converted_at' => $status === 'won' ? now() : null,
        ]);
    }

    private function seedData(): void
    {
        $this->travelTo(now()->utc()->startOfMonth()->addDays(14)->setTime(12, 0)); // mitad de mes, sin bordes
        $thisMonth = now()->toDateTimeString();
        $lastMonth = now()->subMonth()->toDateTimeString();
        $today = now()->toDateString();

        $this->payment('validated', $this->method, 10000, $thisMonth);
        $this->payment('validated', $this->method, 5050, $thisMonth);
        $this->payment('validated', $this->card, 2000, $thisMonth);       // cuenta en cobrado, no en vouchers
        $this->payment('validated', $this->method, 9999, $lastMonth);     // otro mes
        $this->payment('reported', $this->method, 7777, $thisMonth);      // no validado

        $this->invoice('invoice', 'issued', $today, now()->addDays(10)->toDateString(), 30000, 30000);   // facturado + por vencer
        $this->invoice('receipt', 'paid', $today, $today, 20000, 0);                                     // facturado
        $this->invoice('invoice', 'draft', $today, $today, 8000, 8000);                                  // no
        $this->invoice('invoice', 'issued', now()->subMonth()->toDateString(), now()->subDays(3)->toDateString(), 12000, 12000); // vencido, otro mes
        $this->invoice('invoice', 'issued', $today, now()->addDays(45)->toDateString(), 4000, 4000);     // fuera de 30 d

        $this->ticket('new');
        $this->ticket('in_progress');
        $this->ticket('resolved');
        $this->ticket('closed');

        $channel = (string) Str::uuid();
        DB::table('lead_channels')->insert(['id' => $channel, 'organization_id' => $this->org, 'code' => 'kpi-ch', 'name' => 'Canal', 'kind' => 'other']);
        $stage = (string) DB::table('pipeline_stages')->value('id');
        $this->lead('open', 100000, $channel, $stage);
        $this->lead('open', 50000, $channel, $stage);
        $this->lead('open', null, $channel, $stage, null);
        $this->lead('won', 900000, $channel, $stage);                      // ganado: no suma al embudo
        $this->lead('lost', 900000, $channel, $stage);
        $this->lead('open', 700000, $channel, $stage, 'PEN', now()->toDateTimeString()); // borrado
    }

    public function test_admin_gets_exact_real_values(): void
    {
        $this->seedData();
        $data = $this->getJson('/api/v1/admin/kpis')->assertOk()->json('data');

        $this->assertEqualsWithDelta(170.5, $data['cobrado']['value'], 0.001);
        $this->assertSame(2, $data['vouch']['value']);
        $this->assertEqualsWithDelta(540.0, $data["facturado"]["value"], 0.001);   // 30000 + 20000 + 4000 céntimos
        $this->assertEqualsWithDelta(120.0, $data['vencido']['value'], 0.001);
        $this->assertEqualsWithDelta(300.0, $data['porvencer']['value'], 0.001);
        $this->assertEqualsWithDelta(1500.0, $data['embudo']['value'], 0.001);
        $this->assertSame(1, $data['ganados']['value']);
        $this->assertSame(2, $data['tkab']['value']);
        $this->assertSame(0, $data['activos']['value']);
        $this->assertSame(0, $data['domv']['value']);
        $this->assertSame(0, $data['rrec']['value']);
        $this->assertEqualsWithDelta(0.0, $data['mrr']['value'], 0.001);
        $this->assertIsString($data['cobrado']['as_of']);
    }

    public function test_money_metric_is_omitted_when_other_currency_present(): void
    {
        $this->seedData();
        $this->payment('validated', $this->method, 1000, now()->toDateTimeString(), 'USD');
        $data = $this->getJson('/api/v1/admin/kpis')->assertOk()->json('data');

        $this->assertArrayNotHasKey('cobrado', $data);
        $this->assertArrayHasKey('vouch', $data);      // el conteo no depende de la moneda
        $this->assertArrayHasKey('facturado', $data);
    }

    public function test_each_key_is_omitted_without_its_permission(): void
    {
        $this->seedData();

        // Soporte: sin facturación ni pagos.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $support = $this->getJson('/api/v1/admin/kpis')->assertOk()->json('data');
        foreach (['cobrado', 'vouch', 'facturado', 'vencido', 'porvencer', 'mrr', 'arr'] as $k) {
            $this->assertArrayNotHasKey($k, $support);
        }
        $this->assertSame(2, $support['tkab']['value']);

        // Contador externo: ve facturación, pero no ventas ni soporte.
        $this->actAs($this->makeUser(['external_accountant'], mfa: true));
        $acc = $this->getJson('/api/v1/admin/kpis')->assertOk()->json('data');
        $this->assertArrayHasKey('facturado', $acc);
        $this->assertArrayNotHasKey('embudo', $acc);
        $this->assertArrayNotHasKey('tkab', $acc);
    }

    public function test_requires_authentication_and_mfa(): void
    {
        $this->actAs($this->makeUser(['admin']));
        $this->assertProblem($this->getJson('/api/v1/admin/kpis'), 403, 'mfa_required');

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/kpis')->assertUnauthorized();
    }
}
