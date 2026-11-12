<?php

declare(strict_types=1);

namespace Tests\Feature\Dashboard;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** KPIs del panel de inicio: cifras exactas sobre datos reales y filtrado por permiso. */
final class DashboardTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $org;

    private string $entity;

    private string $brand;

    private string $brand2;

    private string $customer;

    private string $product;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Dashboard SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'dash-a', 'name' => 'Dash A', 'portal_domain' => 'portal.dash-a.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->brand2 = $this->postJson('/api/v1/admin/brands', ['code' => 'dash-b', 'name' => 'Dash B', 'portal_domain' => 'portal.dash-b.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Dash SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->product = (string) Str::uuid();
        $cat = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $cat, 'organization_id' => $this->org, 'code' => 'hosting', 'name' => 'Hosting']);
        DB::table('products')->insert(['id' => $this->product, 'organization_id' => $this->org, 'code' => 'H1', 'category_id' => $cat, 'name' => 'Hosting 1', 'billing_type' => 'recurring']);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function service(string $status, ?string $dueDate, string $brand, string $cycle, int $price, string $currency, float $qty = 1, string $subStatus = 'active'): void
    {
        $id = (string) Str::uuid();
        $n = ++$this->seq;
        DB::table('services')->insert([
            'id' => $id, 'organization_id' => $this->org, 'code' => "SRV-D{$n}", 'customer_id' => $this->customer, 'brand_id' => $brand,
            'product_id' => $this->product, 'label' => "svc{$n}.pe", 'status' => $status, 'activated_at' => $status === 'active' ? now() : null,
            'commercial_due_date' => $dueDate,
        ]);
        DB::table('subscriptions')->insert([
            'organization_id' => $this->org, 'service_id' => $id, 'cycle' => $cycle, 'quantity' => $qty, 'price_minor' => $price,
            'currency' => $currency, 'next_invoice_date' => now()->toDateString(), 'starts_on' => now()->toDateString(), 'status' => $subStatus,
        ]);
    }

    private function invoice(string $status, string $dueDate, int $total, int $balance): void
    {
        $n = ++$this->seq;
        DB::table('invoices')->insert([
            'organization_id' => $this->org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $this->customer,
            'type' => 'invoice', 'status' => $status, 'series' => 'F001', 'number' => $n, 'currency' => 'PEN',
            'issue_date' => now()->subDays(40)->toDateString(), 'issued_at' => now()->subDays(40), 'due_date' => $dueDate,
            'subtotal_minor' => $total, 'total_minor' => $total, 'balance_minor' => $balance,
        ]);
    }

    private function ticket(string $status, ?string $assignee, ?string $dueAt, ?string $brand = null): void
    {
        $n = ++$this->seq;
        DB::table('tickets')->insert([
            'organization_id' => $this->org, 'number' => "TK-D{$n}", 'brand_id' => $brand ?? $this->brand, 'channel' => 'portal', 'subject' => "Ticket {$n}",
            'status' => $status, 'assignee_id' => $assignee, 'resolution_due_at' => $dueAt,
            'resolved_at' => in_array($status, ['resolved', 'closed'], true) ? now() : null,
        ]);
    }

    private function seedData(): void
    {
        // MRR PEN: anual 1.200.000/12 = 100.000 + mensual 1.990 x 2 = 3.980 -> 103.980. USD: trimestral 30.000/3 = 10.000.
        $this->service('active', now()->addDays(10)->toDateString(), $this->brand, 'annual', 1200000, 'PEN');     // vence en 10 días
        $this->service('active', now()->addDays(45)->toDateString(), $this->brand, 'monthly', 1990, 'PEN', 2);   // fuera de 30 días
        $this->service('active', null, $this->brand2, 'quarterly', 30000, 'USD');                                  // otra marca, sin vencimiento
        // Fuera del MRR: servicio suspendido con suscripción pausada; servicio activo con suscripción cancelada
        // (este sí cuenta en services_due_30 porque ese KPI mira solo el servicio).
        $this->service('suspended', now()->addDays(5)->toDateString(), $this->brand, 'monthly', 99999, 'PEN', 1, 'paused');
        $this->service('active', now()->addDays(5)->toDateString(), $this->brand, 'monthly', 88888, 'PEN', 1, 'cancelled');

        // Por cobrar PEN: vencida 11.800 + al día 5.000 = 16.800; vencido 11.800. La pagada no cuenta.
        $this->invoice('overdue', now()->subDays(10)->toDateString(), 11800, 11800);
        $this->invoice('issued', now()->addDays(10)->toDateString(), 5000, 5000);
        $this->invoice('paid', now()->subDays(20)->toDateString(), 7000, 0);

        $this->ticket('new', null, now()->subHour()->toDateTimeString());                       // abierto, sin asignar, SLA vencido
        $this->ticket('resolved', null, now()->subDay()->toDateTimeString());                   // resuelto: no cuenta
        $this->ticket('in_progress', $this->admin->id, now()->addDay()->toDateTimeString());    // abierto, asignado, SLA vigente
        $this->ticket('open', null, null, $this->brand2);                                       // abierto, sin asignar, otra marca
    }

    public function test_dashboard_returns_exact_kpis(): void
    {
        $this->seedData();

        $data = $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data');

        $this->assertSame([['currency' => 'PEN', 'amount_minor' => 103980], ['currency' => 'USD', 'amount_minor' => 10000]], $data['mrr']);
        $this->assertSame(2, $data['services_due_30']);
        $this->assertSame([['currency' => 'PEN', 'total_minor' => 16800, 'overdue_minor' => 11800]], $data['receivable']);
        $this->assertSame(['open' => 3, 'overdue_sla' => 1, 'unassigned' => 2], $data['tickets']);
    }

    public function test_brand_filter_scopes_all_but_receivable(): void
    {
        $this->seedData();

        $data = $this->getJson("/api/v1/admin/dashboard?brand_id={$this->brand}")->assertOk()->json('data');

        $this->assertSame([['currency' => 'PEN', 'amount_minor' => 103980]], $data['mrr']);
        $this->assertSame(2, $data['services_due_30']);
        $this->assertSame(['open' => 2, 'overdue_sla' => 1, 'unassigned' => 1], $data['tickets']);
        $this->assertSame([['currency' => 'PEN', 'total_minor' => 16800, 'overdue_minor' => 11800]], $data['receivable']);

        // Un brand_id que no es uuid se ignora (sin error ni filtro).
        $all = $this->getJson('/api/v1/admin/dashboard?brand_id=no-es-uuid')->assertOk()->json('data');
        $this->assertSame(3, $all['tickets']['open']);
    }

    public function test_metrics_are_omitted_without_permission(): void
    {
        $this->seedData();

        // Soporte ve servicios y tickets, pero no billing.invoice.view.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $data = $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data');

        $this->assertArrayNotHasKey('receivable', $data);
        $this->assertArrayHasKey('mrr', $data);
        $this->assertArrayHasKey('services_due_30', $data);
        $this->assertArrayHasKey('tickets', $data);

        // Documentación no tiene billing ni (según su rol) nada de esto además de lectura: nunca expone receivable.
        $this->actAs($this->makeUser(['documentation'], mfa: true));
        $this->assertArrayNotHasKey('receivable', $this->getJson('/api/v1/admin/dashboard')->assertOk()->json('data'));
    }

    public function test_dashboard_requires_authentication(): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/dashboard')->assertUnauthorized();
    }

    public function test_dashboard_enforces_mfa_and_password_gates_like_the_rest_of_admin(): void
    {
        // Staff que aún no enroló MFA (el admin siempre lo exige): no debe ver KPIs.
        $this->actAs($this->makeUser(['admin']));
        $this->assertProblem($this->getJson('/api/v1/admin/dashboard'), 403, 'mfa_required');

        // Staff con contraseña pendiente de cambio: tampoco.
        $pending = $this->makeUser(['admin'], mfa: true);
        DB::table('users')->where('id', $pending->id)->update(['must_change_password' => true]);
        $this->actAs($pending->refresh());
        $this->assertProblem($this->getJson('/api/v1/admin/dashboard'), 403, 'password_change_required');
    }
}
