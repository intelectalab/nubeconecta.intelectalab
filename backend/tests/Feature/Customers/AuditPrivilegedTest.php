<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

final class AuditPrivilegedTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $superadmin;

    /** @var array<string, mixed> */
    private array $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->superadmin = $this->makeUser(['superadmin'], mfa: true);
        $this->actingAs($this->superadmin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'Marca A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => 'Delta SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970',
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $brand,
        ])->assertCreated()->json('data');
    }

    public function test_superadmin_customer_action_is_marked_privileged(): void
    {
        $this->assertSame(1, DB::table('audit_events')
            ->where('actor_type', 'user')->where('actor_id', $this->superadmin->id)
            ->where('action', 'customer.created')->where('customer_id', $this->customer['id'])
            ->whereRaw("metadata->>'actor_privileged' = 'true'")->count());
    }

    public function test_regular_admin_action_is_not_marked_privileged(): void
    {
        $admin = $this->makeUser(['admin'], mfa: true);
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($admin);

        $this->patchJson("/api/v1/admin/customers/{$this->customer['id']}", [
            'version' => $this->customer['version'], 'trade_name' => 'Delta Comercial',
        ])->assertOk();

        $row = DB::table('audit_events')->where('actor_id', $admin->id)
            ->where('action', 'customer.updated')->where('customer_id', $this->customer['id'])->first();
        $this->assertNotNull($row);
        $metadata = json_decode((string) $row->metadata, true, flags: JSON_THROW_ON_ERROR);
        $this->assertArrayNotHasKey('actor_privileged', $metadata);
    }

    public function test_customer_history_hides_privileged_entries_from_admin(): void
    {
        $auditId = DB::table('audit_events')->where('actor_id', $this->superadmin->id)
            ->where('action', 'customer.created')->where('customer_id', $this->customer['id'])->value('id');
        $this->assertNotNull($auditId);

        $admin = $this->makeUser(['admin'], mfa: true);
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($admin);
        $this->getJson("/api/v1/admin/customers/{$this->customer['id']}/history")
            ->assertOk()->assertJsonMissing(['id' => $auditId]);

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->superadmin);
        $this->getJson("/api/v1/admin/customers/{$this->customer['id']}/history")
            ->assertOk()->assertJsonFragment(['id' => $auditId]);
    }
}
