<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

/** Vista "ver como cliente" (customers.customer.impersonate): solo lectura, auditada y temporal. */
final class ImpersonationTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $superadmin;

    /** @var array<string, mixed> */
    private array $customer;

    protected function setUp(): void
    {
        parent::setUp();
        // Impersonar (customers.customer.impersonate) es superadmin-only.
        $this->superadmin = $this->makeUser(['superadmin'], mfa: true);
        $this->actingAs($this->superadmin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'Marca A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => 'Delta SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970',
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $brand,
        ])->assertCreated()->json('data');
    }

    public function test_admin_views_portal_read_only_and_everything_is_audited(): void
    {
        // Sin la vista activa, el staff no entra al portal.
        $this->assertProblem($this->getJson('/api/v1/portal/account'), 403, 'forbidden');

        $start = $this->postJson("/api/v1/admin/customers/{$this->customer['id']}/impersonation")->assertOk();
        $this->assertSame($this->customer['id'], $start->json('data.customer_id'));
        $this->assertNotEmpty($start->json('data.portal_url'));

        // `me` expone la vista para que el portal muestre el banner.
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.impersonation.customer_id', $this->customer['id']);

        // Lee el portal como el cliente...
        $this->getJson('/api/v1/portal/account')->assertOk()->assertJsonPath('data.id', $this->customer['id']);
        // ...pero no escribe (solo lectura), ni pierde sus rutas de staff.
        $this->assertProblem($this->postJson('/api/v1/portal/contacts', ['name' => 'X', 'email' => 'x@x.pe']), 403, 'forbidden');
        $this->getJson('/api/v1/admin/customers')->assertOk();

        $this->deleteJson('/api/v1/admin/customers/impersonation')->assertNoContent();
        $this->assertProblem($this->getJson('/api/v1/portal/account'), 403, 'forbidden');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.impersonation', null);

        foreach (['customer.impersonation_started', 'customer.impersonation_ended'] as $action) {
            $this->assertSame(1, DB::table('audit_events')->where('action', $action)
                ->where('entity_id', $this->customer['id'])->where('customer_id', $this->customer['id'])
                ->where('actor_id', $this->superadmin->id)->count(), $action);
        }
    }

    public function test_view_expires_and_other_roles_cannot_start_it(): void
    {
        $this->postJson("/api/v1/admin/customers/{$this->customer['id']}/impersonation")->assertOk();
        $this->travel(31)->minutes();
        $this->assertProblem($this->getJson('/api/v1/portal/account'), 403, 'forbidden');
        $this->travelBack();

        // Ni ventas ni el admin normal pueden impersonar: es superadmin-only.
        foreach (['sales', 'admin'] as $roleCode) {
            $user = $this->makeUser([$roleCode], mfa: true);
            $this->flushSession();
            $this->app['auth']->forgetGuards();
            $this->actingAs($user);
            $this->assertProblem($this->postJson("/api/v1/admin/customers/{$this->customer['id']}/impersonation"), 403, 'forbidden');
        }
    }
}
