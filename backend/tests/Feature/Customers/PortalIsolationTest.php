<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

final class PortalIsolationTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', [
            'legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001',
        ])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', [
            'code' => 'marca-isolation', 'name' => 'Marca Isolation',
            'portal_domain' => 'portal.isolation.test', 'default_legal_entity_id' => $entity,
        ])->assertCreated()->json('data.id');
    }

    public function test_portal_customer_comes_from_authenticated_session_and_cannot_read_another_customer(): void
    {
        $customerA = $this->createCustomer('Cliente A SAC', '20100070970');
        $contactA = $this->createPortalContact($customerA['id'], 'Contacto A', 'a@cliente.test');
        $customerB = $this->createCustomer('Cliente B SAC', '20000000028');
        $contactB = $this->createPortalContact($customerB['id'], 'Contacto B', 'b@cliente.test');

        $this->actAs($contactA['user']);
        $account = $this->getJson('/api/v1/portal/account?customer_id='.$customerB['id'])
            ->assertOk()->assertJsonPath('data.id', $customerA['id'])
            ->assertJsonPath('data.legal_name', 'Cliente A SAC');
        $this->assertStringNotContainsString('Cliente B SAC', json_encode($account->json()));

        $contacts = $this->getJson('/api/v1/portal/contacts')->assertOk();
        $this->assertSame([$contactA['id']], array_column($contacts->json('data'), 'id'));
        $this->assertProblem($this->patchJson('/api/v1/portal/contacts/'.$contactB['id'], [
            'version' => 1, 'name' => 'Intrusión',
        ]), 404, 'not_found');
        $this->assertSame('Contacto B', DB::table('contacts')->where('id', $contactB['id'])->value('name'));
    }

    /** @return array<string, mixed> */
    private function createCustomer(string $name, string $taxId): array
    {
        return $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data');
    }

    /** @return array{id: string, user: User} */
    private function createPortalContact(string $customerId, string $name, string $email): array
    {
        $id = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", [
            'name' => $name, 'email' => $email, 'roles' => ['administrative'], 'portal_role' => 'customer_admin',
        ])->assertCreated()->json('data.id');

        return ['id' => $id, 'user' => User::query()->findOrFail(Contact::query()->findOrFail($id)->user_id)];
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
