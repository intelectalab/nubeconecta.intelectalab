<?php

declare(strict_types=1);

namespace Tests\Feature\Dashboard;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** "Atención hoy": contadores exactos por fuente y omisión de claves sin permiso. */
final class AttentionTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private string $org;

    private string $entity;

    private string $brand;

    private string $customer;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Atn SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'atn', 'name' => 'Atn', 'portal_domain' => 'portal.atn.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Atn SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function invoice(string $status, string $dueDate, int $balance): void
    {
        $n = ++$this->seq;
        DB::table('invoices')->insert([
            'organization_id' => $this->org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $this->customer,
            'type' => 'invoice', 'status' => $status, 'series' => 'F001', 'number' => $n, 'currency' => 'PEN',
            'issue_date' => now()->subDays(5)->toDateString(), 'issued_at' => now()->subDays(5), 'due_date' => $dueDate,
            'subtotal_minor' => 1000, 'total_minor' => 1000, 'balance_minor' => $balance,
        ]);
    }

    private function payment(string $status, string $method): void
    {
        $n = ++$this->seq;
        DB::table('payments')->insert([
            'organization_id' => $this->org, 'customer_id' => $this->customer, 'payment_method_id' => $method, 'status' => $status,
            'amount_minor' => 1000, 'currency' => 'PEN', 'reported_via' => 'finance', 'external_id' => "ext-{$n}", 'received_at' => now(),
            'validated_at' => $status === 'validated' ? now() : null, 'validated_by' => $status === 'validated' ? User::query()->value('id') : null,
            'rejection_reason' => $status === 'rejected' ? 'x' : null,
        ]);
    }

    private function domain(string $status, bool $autoRenew, ?string $expires): void
    {
        $n = ++$this->seq;
        DB::table('domains')->insert([
            'organization_id' => $this->org, 'name' => "atn{$n}.pe", 'tld' => 'pe', 'holder' => 'company', 'customer_id' => $this->customer,
            'status' => $status, 'auto_renew' => $autoRenew, 'registry_expires_at' => $expires,
        ]);
    }

    private function ticket(string $status, ?string $dueAt): void
    {
        $n = ++$this->seq;
        DB::table('tickets')->insert([
            'organization_id' => $this->org, 'number' => "TK-A{$n}", 'brand_id' => $this->brand, 'channel' => 'portal', 'subject' => "T{$n}",
            'status' => $status, 'resolution_due_at' => $dueAt, 'resolved_at' => in_array($status, ['resolved', 'closed'], true) ? now() : null,
        ]);
    }

    private function lead(string $status, ?string $followUp, string $channel, string $stage): void
    {
        $n = ++$this->seq;
        DB::table('leads')->insert([
            'organization_id' => $this->org, 'code' => "L-{$n}", 'name' => "Lead {$n}", 'brand_id' => $this->brand, 'lead_channel_id' => $channel,
            'pipeline_stage_id' => $stage, 'status' => $status, 'next_follow_up_at' => $followUp,
            'customer_id' => $status === 'won' ? $this->customer : null, 'lost_reason' => $status === 'lost' ? 'x' : null,
        ]);
    }

    private function seedData(): void
    {
        $this->travelTo(now()->utc()->startOfDay()->addHours(12)); // mediodía UTC: sin bordes de día
        $method = (string) Str::uuid();
        DB::table('payment_methods')->insert(['id' => $method, 'organization_id' => $this->org, 'code' => 'atn-m', 'name' => 'M', 'kind' => 'bank_transfer']);
        $today = now()->toDateString();

        $this->payment('reported', $method);
        $this->payment('reported', $method);
        $this->payment('validated', $method);
        $this->payment('rejected', $method);

        $this->invoice('issued', $today, 1000);
        $this->invoice('partially_paid', $today, 400);
        $this->invoice('overdue', $today, 1000);
        $this->invoice('issued', now()->addDay()->toDateString(), 1000);  // vence mañana
        $this->invoice('issued', now()->subDay()->toDateString(), 1000);  // venció ayer
        $this->invoice('paid', $today, 0);                                  // saldada

        $this->domain('active', false, $today);                                  // cuenta (borde hoy)
        $this->domain('active', false, now()->addDays(7)->toDateString());       // cuenta (borde +7)
        $this->domain('active', false, now()->addDays(8)->toDateString());       // fuera
        $this->domain('active', false, now()->subDay()->toDateString());         // ya vencido
        $this->domain('active', true, now()->addDays(3)->toDateString());        // auto-renovación
        $this->domain('expired', false, now()->addDays(3)->toDateString());      // no activo
        $this->domain('active', false, null);                                    // sin fecha

        $this->ticket('new', now()->subHour()->toDateTimeString());        // cuenta
        $this->ticket('in_progress', now()->subDay()->toDateTimeString()); // cuenta
        $this->ticket('resolved', now()->subDay()->toDateTimeString());    // cerrado
        $this->ticket('open', now()->addHour()->toDateTimeString());       // vigente
        $this->ticket('open', null);                                       // sin SLA

        $channel = (string) Str::uuid();
        DB::table('lead_channels')->insert(['id' => $channel, 'organization_id' => $this->org, 'code' => 'atn-ch', 'name' => 'Canal', 'kind' => 'other']);
        $stage = (string) DB::table('pipeline_stages')->value('id');
        $this->lead('open', now()->toDateTimeString(), $channel, $stage);                            // cuenta
        $this->lead('open', now()->startOfDay()->addMinute()->toDateTimeString(), $channel, $stage); // cuenta
        $this->lead('open', now()->addDay()->toDateTimeString(), $channel, $stage);                  // mañana
        $this->lead('open', now()->subDay()->toDateTimeString(), $channel, $stage);                  // ayer
        $this->lead('open', null, $channel, $stage);                                                  // sin seguimiento
        $this->lead('lost', now()->toDateTimeString(), $channel, $stage);                            // cerrado
        DB::table('leads')->insert([
            'organization_id' => $this->org, 'code' => 'L-del', 'name' => 'Borrado', 'brand_id' => $this->brand, 'lead_channel_id' => $channel,
            'pipeline_stage_id' => $stage, 'status' => 'open', 'next_follow_up_at' => now(), 'deleted_at' => now(),
        ]);                                                                                           // soft-deleted
    }

    public function test_admin_sees_every_counter_with_exact_values(): void
    {
        $this->seedData();
        $data = $this->getJson('/api/v1/admin/attention')->assertOk()->json('data');

        $this->assertSame([
            'payments_to_validate' => 2,
            'invoices_due_today' => 3,
            'domains_expiring_7d' => 2,
            'tickets_overdue_sla' => 2,
            'sales_followups_today' => 2,
        ], $data);
    }

    public function test_each_key_is_omitted_without_its_permission(): void
    {
        $this->seedData();

        // Soporte: dominios, tickets y leads (sales.*.view); sin facturación.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->assertSame(['domains_expiring_7d' => 2, 'tickets_overdue_sla' => 2, 'sales_followups_today' => 2], $this->getJson('/api/v1/admin/attention')->assertOk()->json('data'));

        // Ventas: facturación, tickets y leads; sin dominios.
        $this->actAs($this->makeUser(['sales'], mfa: true));
        $this->assertSame(['payments_to_validate' => 2, 'invoices_due_today' => 3, 'tickets_overdue_sla' => 2, 'sales_followups_today' => 2], $this->getJson('/api/v1/admin/attention')->assertOk()->json('data'));

        // Contador externo: solo facturación.
        $this->actAs($this->makeUser(['external_accountant'], mfa: true));
        $this->assertSame(['payments_to_validate' => 2, 'invoices_due_today' => 3], $this->getJson('/api/v1/admin/attention')->assertOk()->json('data'));

        // Documentación: sin facturación.
        $this->actAs($this->makeUser(['documentation'], mfa: true));
        $doc = $this->getJson('/api/v1/admin/attention')->assertOk()->json('data');
        $this->assertArrayNotHasKey('payments_to_validate', $doc);
        $this->assertArrayNotHasKey('invoices_due_today', $doc);
        $this->assertArrayHasKey('domains_expiring_7d', $doc);
    }

    public function test_requires_authentication(): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/attention')->assertUnauthorized();
    }

    public function test_enforces_mfa_and_password_gates(): void
    {
        $this->actAs($this->makeUser(['admin']));
        $this->assertProblem($this->getJson('/api/v1/admin/attention'), 403, 'mfa_required');

        $pending = $this->makeUser(['admin'], mfa: true);
        DB::table('users')->where('id', $pending->id)->update(['must_change_password' => true]);
        $this->actAs($pending->refresh());
        $this->assertProblem($this->getJson('/api/v1/admin/attention'), 403, 'password_change_required');
    }

    public function test_is_rate_limited(): void
    {
        for ($i = 0; $i < 60; $i++) {
            $this->getJson('/api/v1/admin/attention')->assertOk();
        }
        $this->getJson('/api/v1/admin/attention')->assertStatus(429);
    }
}
