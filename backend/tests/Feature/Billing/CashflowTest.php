<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Flujo facturado vs. cobrado: series de 12 meses exactas, solo validated cuenta, gates de permiso. */
final class CashflowTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private string $org;

    private string $entity;

    private string $brand;

    private string $customer;

    private string $bank;

    private string $paypal;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Flujo SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'flujo', 'name' => 'Flujo', 'portal_domain' => 'portal.flujo.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Flujo SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->bank = $this->method('flujo-bank', 'Transferencia Flujo', 'bank_transfer');
        $this->paypal = $this->method('flujo-pp', 'PayPal Flujo', 'paypal');
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function method(string $code, string $name, string $kind): string
    {
        $id = (string) Str::uuid();
        DB::table('payment_methods')->insert(['id' => $id, 'organization_id' => $this->org, 'code' => $code, 'name' => $name, 'kind' => $kind]);

        return $id;
    }

    private function invoice(string $type, string $status, ?string $issueDate, int $total, string $currency = 'PEN'): void
    {
        $n = ++$this->seq;
        $draft = $status === 'draft';
        $ref = DB::table('invoices')->where('type', 'invoice')->value('id');
        DB::table('invoices')->insert([
            'organization_id' => $this->org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $this->customer,
            'type' => $type, 'status' => $status, 'series' => $draft ? null : 'F001', 'number' => $draft ? null : $n, 'currency' => $currency,
            'issue_date' => $issueDate, 'issued_at' => $draft ? null : now(), 'voided_at' => $status === 'void' ? now() : null,
            'subtotal_minor' => $total, 'total_minor' => $total, 'balance_minor' => $status === 'paid' ? 0 : $total,
            'references_invoice_id' => in_array($type, ['credit_note', 'debit_note'], true) ? $ref : null,
        ]);
    }

    private function payment(string $status, string $receivedAt, int $amount, string $method, string $currency = 'PEN'): void
    {
        $n = ++$this->seq;
        DB::table('payments')->insert([
            'organization_id' => $this->org, 'customer_id' => $this->customer, 'payment_method_id' => $method, 'status' => $status,
            'amount_minor' => $amount, 'currency' => $currency, 'reported_via' => 'finance', 'external_id' => "ext-{$n}",
            'received_at' => $receivedAt,
            'validated_at' => $status === 'validated' ? $receivedAt : null, 'validated_by' => $status === 'validated' ? User::query()->value('id') : null,
            'rejection_reason' => $status === 'rejected' ? 'no coincide' : null,
        ]);
    }

    /** @return array<string,int> */
    private function points(array $series, string $currency): array
    {
        foreach ($series as $s) {
            if ($s['currency'] === $currency) {
                return array_column($s['points'], 'amount_minor', 'month');
            }
        }
        $this->fail("sin serie {$currency}");
    }

    private function seedData(): void
    {
        $this->travelTo(now()->utc()->startOfMonth()->addDays(14)); // a mitad de mes: sin bordes
        $m0 = now()->utc();
        $m1 = $m0->copy()->subMonthNoOverflow();
        $m11 = $m0->copy()->subMonthsNoOverflow(11);
        $old = $m0->copy()->subMonthsNoOverflow(12);

        // Base para que las notas tengan documento referenciado (cuenta como mes actual abajo).
        // Facturado PEN mes actual: 10.000 + 2.000 (debit_note) + 500 (receipt) - 1.500 (credit_note) = 11.000
        $this->invoice('invoice', 'issued', $m0->toDateString(), 10000);
        $this->invoice('debit_note', 'paid', $m0->toDateString(), 2000);
        $this->invoice('receipt', 'paid', $m0->toDateString(), 500);
        $this->invoice('credit_note', 'issued', $m0->toDateString(), 1500);
        // No cuentan: void, draft (con issue_date), sin issue_date y fuera de ventana (hace 12 meses).
        $this->invoice('invoice', 'void', $m0->toDateString(), 99999);
        $this->invoice('invoice', 'draft', $m0->toDateString(), 88888);
        $this->invoice('invoice', 'draft', null, 77777);
        $this->invoice('invoice', 'issued', $old->toDateString(), 66666);
        // Mes anterior PEN 3.000; primer mes de la ventana USD 4.000.
        $this->invoice('invoice', 'overdue', $m1->toDateString(), 3000);
        $this->invoice('invoice', 'issued', $m11->toDateString(), 4000, 'USD');

        // Cobrado: solo validated.
        $this->payment('validated', $m0->toDateTimeString(), 7000, $this->bank);
        $this->payment('validated', $m0->toDateTimeString(), 1000, $this->bank);
        $this->payment('validated', $m0->toDateTimeString(), 2500, $this->paypal, 'USD');
        $this->payment('reported', $m0->toDateTimeString(), 50000, $this->bank);
        $this->payment('rejected', $m0->toDateTimeString(), 40000, $this->bank);
        $this->payment('validated', $m1->toDateTimeString(), 3000, $this->paypal);
        $this->payment('validated', $old->toDateTimeString(), 55555, $this->bank); // fuera de ventana
    }

    public function test_series_and_methods_are_exact(): void
    {
        $this->seedData();
        $data = $this->getJson('/api/v1/admin/billing/cashflow')->assertOk()->json('data');

        $m0 = now()->utc();
        $cur = $m0->format('Y-m');
        $prev = $m0->copy()->subMonthNoOverflow()->format('Y-m');
        $first = $m0->copy()->subMonthsNoOverflow(11)->format('Y-m');

        $this->assertCount(12, $data['months']);
        $this->assertSame($first, $data['months'][0]);
        $this->assertSame($cur, $data['months'][11]);

        // Ambas series traen las mismas monedas (PEN, USD), con 12 puntos cronológicos cada una.
        foreach (['billed', 'collected'] as $key) {
            $this->assertSame(['PEN', 'USD'], array_column($data[$key], 'currency'));
            foreach ($data[$key] as $s) {
                $this->assertSame($data['months'], array_column($s['points'], 'month'));
            }
        }

        $billedPen = $this->points($data['billed'], 'PEN');
        $this->assertSame(11000, $billedPen[$cur]);
        $this->assertSame(3000, $billedPen[$prev]);
        $this->assertSame(14000, array_sum($billedPen));
        $billedUsd = $this->points($data['billed'], 'USD');
        $this->assertSame(4000, $billedUsd[$first]);
        $this->assertSame(4000, array_sum($billedUsd));

        $collPen = $this->points($data['collected'], 'PEN');
        $this->assertSame(8000, $collPen[$cur]);
        $this->assertSame(3000, $collPen[$prev]);
        $this->assertSame(11000, array_sum($collPen));
        $collUsd = $this->points($data['collected'], 'USD');
        $this->assertSame(2500, $collUsd[$cur]);
        $this->assertSame(2500, array_sum($collUsd));

        // Métodos del mes actual: solo validated; ordenado por moneda y luego mayor monto.
        $this->assertSame([
            ['kind' => 'bank_transfer', 'name' => 'Transferencia Flujo', 'currency' => 'PEN', 'amount_minor' => 8000],
            ['kind' => 'paypal', 'name' => 'PayPal Flujo', 'currency' => 'USD', 'amount_minor' => 2500],
        ], $data['methods']);
    }

    public function test_empty_org_returns_empty_series(): void
    {
        $data = $this->getJson('/api/v1/admin/billing/cashflow')->assertOk()->json('data');
        $this->assertCount(12, $data['months']);
        $this->assertSame([], $data['billed']);
        $this->assertSame([], $data['collected']);
        $this->assertSame([], $data['methods']);
    }

    public function test_requires_authentication_and_invoice_view_permission(): void
    {
        // Soporte no tiene billing.invoice.view.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->getJson('/api/v1/admin/billing/cashflow')->assertForbidden();

        // Finanzas sí.
        $this->actAs($this->makeUser(['finance'], mfa: true));
        $this->getJson('/api/v1/admin/billing/cashflow')->assertOk();

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/billing/cashflow')->assertUnauthorized();
    }

    public function test_collected_and_methods_require_payment_view_permission(): void
    {
        $this->seedData();
        // Rol a medida: ve facturas pero NO pagos (ningún rol sembrado tiene esa combinación).
        $role = \App\Modules\Identity\Models\Role::create(['organization_id' => $this->org, 'code' => 'solo-facturas', 'name' => 'Solo facturas', 'audience' => 'staff', 'is_system' => false]);
        $permId = (string) \App\Modules\Identity\Models\Permission::query()->where('code', 'billing.invoice.view')->value('id');
        $role->syncPermissionIds([$permId]);
        $this->actAs($this->makeUser(['solo-facturas'], mfa: true));

        $data = $this->getJson('/api/v1/admin/billing/cashflow')->assertOk()->json('data');
        // Ve lo facturado, pero cobrado y métodos quedan vacíos sin billing.payment.view.
        $this->assertNotSame([], $data['billed']);
        $this->assertSame([], $data['collected']);
        $this->assertSame([], $data['methods']);
    }

    public function test_enforces_mfa_and_password_gates(): void
    {
        $this->actAs($this->makeUser(['admin']));
        $this->assertProblem($this->getJson('/api/v1/admin/billing/cashflow'), 403, 'mfa_required');

        $pending = $this->makeUser(['admin'], mfa: true);
        DB::table('users')->where('id', $pending->id)->update(['must_change_password' => true]);
        $this->actAs($pending->refresh());
        $this->assertProblem($this->getJson('/api/v1/admin/billing/cashflow'), 403, 'password_change_required');
    }

    public function test_is_rate_limited(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->getJson('/api/v1/admin/billing/cashflow')->assertOk();
        }
        $this->getJson('/api/v1/admin/billing/cashflow')->assertStatus(429);
    }
}
