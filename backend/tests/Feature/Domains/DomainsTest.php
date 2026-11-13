<?php

declare(strict_types=1);

namespace Tests\Feature\Domains;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Módulo Domains (fase 1, modo manual): CRUD, contactos, renovación, filtros, aislamiento y permisos. */
final class DomainsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $org;

    private string $entity;

    private string $brand;

    private string $customer;

    private string $customer2;

    private string $product;

    private string $accountA;

    private string $accountB;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Dominios SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'dom-a', 'name' => 'Dom A', 'portal_domain' => 'portal.dom-a.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Uno SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->customer2 = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Zeta Corp SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100047218', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $cat = (string) Str::uuid();
        $this->product = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $cat, 'organization_id' => $this->org, 'code' => 'dominio', 'name' => 'Dominio']);
        DB::table('products')->insert(['id' => $this->product, 'organization_id' => $this->org, 'code' => 'D1', 'category_id' => $cat, 'name' => 'Dominio .com', 'billing_type' => 'recurring']);
        $this->accountA = $this->providerAccount($this->org, 'Namecheap', 'cuenta-a');
        $this->accountB = $this->providerAccount($this->org, 'GoDaddy', 'cuenta-b');
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function providerAccount(string $org, string $providerName, string $label): string
    {
        $provider = (string) Str::uuid();
        $account = (string) Str::uuid();
        DB::table('providers')->insert(['id' => $provider, 'organization_id' => $org, 'code' => Str::slug($providerName).'-'.substr($provider, 0, 4), 'name' => $providerName, 'type' => 'registrar']);
        DB::table('provider_accounts')->insert(['id' => $account, 'organization_id' => $org, 'provider_id' => $provider, 'label' => $label]);
        return $account;
    }

    private function service(string $customer, ?string $dueDate = '2027-03-15', ?string $org = null): string
    {
        $id = (string) Str::uuid();
        $n = ++$this->seq;
        DB::table('services')->insert([
            'id' => $id, 'organization_id' => $org ?? $this->org, 'code' => "SRV-DM{$n}", 'customer_id' => $customer, 'brand_id' => $this->brand,
            'product_id' => $this->product, 'label' => "dominio{$n}.pe", 'status' => 'active', 'activated_at' => now(), 'commercial_due_date' => $dueDate,
        ]);
        return $id;
    }

    private function otherOrgId(): string
    {
        $id = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $id, 'name' => 'Otra organización de dominios', 'slug' => 'otra-dominios-'.substr($id, 0, 6)]);
        return $id;
    }

    /** @return array<string, mixed> */
    private function make(string $name, array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/domains', $extra + ['name' => $name, 'holder' => 'company'])->assertCreated()->json('data');
    }

    private function contactPayload(string $role = 'registrant', array $extra = []): array
    {
        return $extra + ['role' => $role, 'name' => 'Ana Pérez', 'email' => 'ana@example.com'];
    }

    public function test_create_show_update_and_delete_a_manual_domain(): void
    {
        $service = $this->service($this->customer);
        $created = $this->postJson('/api/v1/admin/domains', [
            'name' => 'EjemploUno.COM', 'holder' => 'customer', 'customer_id' => $this->customer, 'service_id' => $service,
            'provider_account_id' => $this->accountA, 'registered_at' => '2025-03-15', 'registry_expires_at' => '2027-03-14',
            'auto_renew' => true, 'nameservers' => ['NS1.Example.com', 'ns2.example.com'],
        ])->assertCreated()
            ->assertJsonPath('data.name', 'ejemplouno.com')->assertJsonPath('data.tld', 'com')
            ->assertJsonPath('data.status', 'active')->assertJsonPath('data.sync_mode', 'manual')
            ->assertJsonPath('data.holder', 'customer')->assertJsonPath('data.registry_expires_at', '2027-03-14')
            ->assertJsonPath('data.commercial_due_date', '2027-03-15')
            ->assertJsonPath('data.registrar.name', 'Namecheap')->assertJsonPath('data.registrar.account_label', 'cuenta-a')
            ->assertJsonPath('data.customer.name', 'Cliente Uno SAC')->assertJsonPath('data.service.id', $service)
            ->assertJsonPath('data.nameservers', ['ns1.example.com', 'ns2.example.com'])
            ->assertJsonPath('data.version', 1)->json('data');

        $this->getJson('/api/v1/admin/domains/'.$created['id'])->assertOk()->assertJsonPath('data.name', 'ejemplouno.com')->assertJsonPath('data.contacts', []);

        $updated = $this->patchJson('/api/v1/admin/domains/'.$created['id'], ['version' => 1, 'auto_renew' => false, 'privacy' => true, 'registry_expires_at' => '2028-03-14'])
            ->assertOk()->assertJsonPath('data.auto_renew', false)->assertJsonPath('data.privacy', true)
            ->assertJsonPath('data.registry_expires_at', '2028-03-14')->assertJsonPath('data.version', 2)->json('data');
        $this->assertSame('2028-03-14', DB::table('domains')->where('id', $created['id'])->value('registry_expires_at'));

        // Concurrencia optimista: versión vieja -> 409; sin versión -> 422.
        $this->assertProblem($this->patchJson('/api/v1/admin/domains/'.$created['id'], ['version' => 1, 'privacy' => false]), 409, 'version_conflict');
        $this->patchJson('/api/v1/admin/domains/'.$created['id'], ['privacy' => false])->assertStatus(422);

        $this->deleteJson('/api/v1/admin/domains/'.$updated['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/domains/'.$created['id'])->assertNotFound();
        $this->assertNotNull(DB::table('domains')->where('id', $created['id'])->value('deleted_at'));
        // El nombre queda libre tras borrar (índice único parcial).
        $this->make('ejemplouno.com');
    }

    public function test_validation_and_unique_name(): void
    {
        $this->make('unico.com');
        $this->postJson('/api/v1/admin/domains', ['name' => 'UNICO.com', 'holder' => 'company'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/admin/domains', ['name' => 'sin-punto', 'holder' => 'company'])->assertStatus(422)->assertJsonValidationErrors('name');
        $this->postJson('/api/v1/admin/domains', ['name' => 'otro.com', 'holder' => 'nadie'])->assertStatus(422)->assertJsonValidationErrors('holder');
        $this->postJson('/api/v1/admin/domains', ['name' => 'otro.com'])->assertStatus(422)->assertJsonValidationErrors('holder');
        $this->postJson('/api/v1/admin/domains', ['name' => 'otro.com', 'holder' => 'company', 'customer_id' => 'no-uuid'])->assertStatus(422)->assertJsonValidationErrors('customer_id');
        $this->postJson('/api/v1/admin/domains', ['name' => 'otro.com', 'holder' => 'company', 'status' => 'raro'])->assertStatus(422)->assertJsonValidationErrors('status');
        // El titular cliente exige un cliente vinculado.
        $this->postJson('/api/v1/admin/domains', ['name' => 'sincliente.com', 'holder' => 'customer'])->assertStatus(422)->assertJsonValidationErrors('customer_id');
        $this->assertSame('com.pe', $this->make('empresa.com.pe')['tld']);
        // Un servicio de otro cliente no puede vincularse.
        $svc = $this->service($this->customer2);
        $this->postJson('/api/v1/admin/domains', ['name' => 'cruce.com', 'holder' => 'customer', 'customer_id' => $this->customer, 'service_id' => $svc])->assertStatus(422);
    }

    public function test_customer_owned_registrar_must_match_the_domain_customer(): void
    {
        $provider = (string) Str::uuid();
        $acct = (string) Str::uuid();
        DB::table('providers')->insert(['id' => $provider, 'organization_id' => $this->org, 'code' => 'reg-cli', 'name' => 'RegCli', 'type' => 'registrar']);
        DB::table('provider_accounts')->insert(['id' => $acct, 'organization_id' => $this->org, 'provider_id' => $provider, 'label' => 'cuenta-cli', 'owner' => 'customer', 'customer_id' => $this->customer2]);

        // Cuenta de registrador propiedad del cliente2: no puede ir en un dominio del cliente1.
        $this->postJson('/api/v1/admin/domains', ['name' => 'cuentaajena.com', 'holder' => 'customer', 'customer_id' => $this->customer, 'provider_account_id' => $acct])
            ->assertStatus(422)->assertJsonValidationErrors('provider_account_id');
        // Con el cliente correcto, pasa.
        $this->postJson('/api/v1/admin/domains', ['name' => 'cuentaok.com', 'holder' => 'customer', 'customer_id' => $this->customer2, 'provider_account_id' => $acct])->assertCreated();
    }

    public function test_renew_extends_the_registry_date_by_exact_years(): void
    {
        $domain = $this->make('renovar.com', ['registry_expires_at' => '2026-12-20']);
        $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/renew', ['years' => 2, 'version' => 1])
            ->assertOk()->assertJsonPath('data.registry_expires_at', '2028-12-20')->assertJsonPath('data.version', 2);
        $this->assertSame('2028-12-20', DB::table('domains')->where('id', $domain['id'])->value('registry_expires_at'));
        // Fin de febrero: sin desbordar al marzo.
        $leap = $this->make('bisiesto.com', ['registry_expires_at' => '2028-02-29']);
        $this->postJson('/api/v1/admin/domains/'.$leap['id'].'/renew', ['years' => 1, 'version' => 1])->assertOk()->assertJsonPath('data.registry_expires_at', '2029-02-28');
        // Vencido -> vuelve a activo al renovar a una fecha futura.
        $old = $this->make('vencido.com', ['registry_expires_at' => '2020-01-10', 'status' => 'expired']);
        $this->postJson('/api/v1/admin/domains/'.$old['id'].'/renew', ['years' => 10, 'version' => 1])
            ->assertOk()->assertJsonPath('data.registry_expires_at', '2030-01-10')->assertJsonPath('data.status', 'active');
        // Sin fecha previa parte de hoy.
        $none = $this->make('sinfecha.com');
        $this->postJson('/api/v1/admin/domains/'.$none['id'].'/renew', ['years' => 1, 'version' => 1])
            ->assertOk()->assertJsonPath('data.registry_expires_at', now()->addYear()->toDateString());
        // Validación de años y versión.
        $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/renew', ['years' => 0, 'version' => 2])->assertStatus(422)->assertJsonValidationErrors('years');
        $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/renew', ['years' => 11, 'version' => 2])->assertStatus(422)->assertJsonValidationErrors('years');
        $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/renew', ['years' => 1])->assertStatus(422);
        $this->assertProblem($this->postJson('/api/v1/admin/domains/'.$domain['id'].'/renew', ['years' => 1, 'version' => 1]), 409, 'version_conflict');
    }

    public function test_filters_and_summary_return_exact_subsets(): void
    {
        $today = now();
        $this->make('hoy.com', ['registry_expires_at' => $today->toDateString(), 'provider_account_id' => $this->accountA, 'holder' => 'company', 'auto_renew' => true]);
        $this->make('en30.com', ['registry_expires_at' => $today->copy()->addDays(30)->toDateString(), 'provider_account_id' => $this->accountA, 'holder' => 'customer', 'customer_id' => $this->customer]);
        $this->make('en31.com', ['registry_expires_at' => $today->copy()->addDays(31)->toDateString(), 'provider_account_id' => $this->accountB, 'holder' => 'customer', 'customer_id' => $this->customer2, 'auto_renew' => true]);
        $this->make('ayer.com', ['registry_expires_at' => $today->copy()->subDay()->toDateString(), 'provider_account_id' => $this->accountB, 'holder' => 'company']);
        $this->make('gracia.com', ['registry_expires_at' => $today->copy()->addDays(5)->toDateString(), 'status' => 'redemption', 'holder' => 'company', 'auto_renew' => true]);
        $this->make('sinfecha.com', ['holder' => 'customer', 'customer_id' => $this->customer, 'auto_renew' => true]);

        $names = fn (string $qs) => collect($this->getJson('/api/v1/admin/domains?'.$qs)->assertOk()->json('data'))->pluck('name')->sort()->values()->all();

        $this->assertCount(6, $names(''));
        $this->assertSame(['en30.com', 'gracia.com', 'hoy.com'], $names('expiring_30d=1'));
        $this->assertCount(6, $names('expiring_30d=0'));
        $this->assertSame(['ayer.com', 'gracia.com', 'hoy.com'], $names('holder=company'));
        $this->assertSame(['en30.com', 'en31.com', 'sinfecha.com'], $names('holder=customer'));
        $this->assertSame(['en30.com', 'hoy.com'], $names('provider_account_id='.$this->accountA));
        $this->assertSame(['ayer.com', 'en31.com'], $names('provider_account_id='.$this->accountB));
        $this->assertSame(['gracia.com'], $names('status=redemption'));
        $this->assertSame(['en30.com', 'sinfecha.com'], $names('customer_id='.$this->customer));
        $this->assertSame(['en30.com'], $names('expiring_30d=1&holder=customer'));
        // Búsqueda por nombre del dominio y por nombre del cliente.
        $this->assertSame(['en30.com', 'en31.com'], $names('search=EN3'));
        $this->assertSame(['en31.com'], $names('search=zeta'));
        $this->assertSame(['en30.com', 'sinfecha.com'], $names('search=cliente%20uno'));
        $this->assertSame([], $names('search=%25'));
        // Valores inválidos se ignoran sin romper.
        $this->assertCount(6, $names('provider_account_id=no-uuid&customer_id=zzz&holder=otro&status=raro'));

        $this->getJson('/api/v1/admin/domains/summary')->assertOk()->assertExactJson(['data' => [
            'total' => 6, 'expiring_30d' => 3, 'expired' => 2, 'holder_company' => 3, 'no_auto_renew' => 2,
        ]]);

        // Paginación por cursor con el esquema estándar.
        $page = $this->getJson('/api/v1/admin/domains?page[size]=4&sort=name')->assertOk();
        $this->assertCount(4, $page->json('data'));
        $this->assertTrue($page->json('meta.has_more'));
    }

    public function test_domain_contacts_crud_by_role(): void
    {
        $domain = $this->make('contactos.com');
        $base = '/api/v1/admin/domains/'.$domain['id'].'/contacts';

        $contact = $this->postJson($base, $this->contactPayload('registrant', ['company' => 'Acme SAC', 'phone' => '+51 999', 'address' => ['line1' => 'Av. 1', 'city' => 'Lima', 'country' => 'PE']]))
            ->assertCreated()->assertJsonPath('data.role', 'registrant')->assertJsonPath('data.address.city', 'Lima')->assertJsonPath('data.version', 1)->json('data');
        $this->postJson($base, $this->contactPayload('tech', ['name' => 'Técnico']))->assertCreated();
        $this->postJson($base, $this->contactPayload('admin'))->assertCreated()->assertJsonPath('data.address', []);

        $this->getJson($base)->assertOk()->assertJsonCount(3, 'data');
        $this->getJson('/api/v1/admin/domains/'.$domain['id'])->assertOk()->assertJsonCount(3, 'data.contacts');

        // Un rol por dominio.
        $this->postJson($base, $this->contactPayload('tech'))->assertStatus(422)->assertJsonValidationErrors('role');

        $this->patchJson($base.'/'.$contact['id'], ['version' => 1, 'name' => 'Nuevo Titular', 'email' => 'nuevo@example.com'])
            ->assertOk()->assertJsonPath('data.name', 'Nuevo Titular')->assertJsonPath('data.email', 'nuevo@example.com')->assertJsonPath('data.version', 2)->assertJsonPath('data.company', 'Acme SAC');
        $this->assertProblem($this->patchJson($base.'/'.$contact['id'], ['version' => 1, 'name' => 'X']), 409, 'version_conflict');
        // Cambiar el rol a uno ya ocupado -> 422; a uno libre -> ok.
        $this->patchJson($base.'/'.$contact['id'], ['version' => 2, 'role' => 'tech'])->assertStatus(422);
        $this->patchJson($base.'/'.$contact['id'], ['version' => 2, 'role' => 'billing'])->assertOk()->assertJsonPath('data.role', 'billing');

        $this->deleteJson($base.'/'.$contact['id'])->assertNoContent();
        $this->getJson($base)->assertJsonCount(2, 'data');
        $this->assertSame(0, DB::table('domain_contacts')->where('id', $contact['id'])->count());

        // Validación.
        $this->postJson($base, $this->contactPayload('billing', ['email' => 'no-es-un-email']))->assertStatus(422)->assertJsonValidationErrors('email');
        $this->postJson($base, $this->contactPayload('dueño'))->assertStatus(422)->assertJsonValidationErrors('role');
        $this->postJson($base, ['role' => 'billing'])->assertStatus(422)->assertJsonValidationErrors(['name', 'email']);
        $this->postJson($base, $this->contactPayload('billing', ['address' => ['country' => 'PERU']]))->assertStatus(422)->assertJsonValidationErrors('address.country');
    }

    public function test_organization_isolation(): void
    {
        $domain = $this->make('mio.com');
        $contact = $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/contacts', $this->contactPayload())->assertCreated()->json('data');

        $other = $this->otherOrgId();
        $otherCustomer = (string) Str::uuid();
        DB::table('customers')->insert(['id' => $otherCustomer, 'organization_id' => $other, 'code' => 'CLI-OTRA1', 'type' => 'company', 'legal_name' => 'Ajena SAC', 'normalized_name' => 'ajena sac', 'origin_brand_id' => $this->brand, 'country' => 'PE', 'currency' => 'PEN']);
        $otherService = $this->service($otherCustomer, '2027-01-01', $other);
        $otherAccount = $this->providerAccount($other, 'Ajeno', 'ajena');
        $otherDomain = (string) Str::uuid();
        DB::table('domains')->insert(['id' => $otherDomain, 'organization_id' => $other, 'name' => 'ajeno.com', 'tld' => 'com', 'holder' => 'company', 'registry_expires_at' => now()->addDays(3)->toDateString()]);
        $otherContact = (string) Str::uuid();
        DB::table('domain_contacts')->insert(['id' => $otherContact, 'organization_id' => $other, 'domain_id' => $otherDomain, 'role' => 'admin', 'name' => 'Ajeno', 'email' => 'a@ajeno.test']);

        // Lectura / escritura sobre dominios y contactos ajenos.
        $this->getJson('/api/v1/admin/domains/'.$otherDomain)->assertNotFound();
        $this->patchJson('/api/v1/admin/domains/'.$otherDomain, ['version' => 1, 'privacy' => true])->assertNotFound();
        $this->deleteJson('/api/v1/admin/domains/'.$otherDomain)->assertNotFound();
        $this->postJson('/api/v1/admin/domains/'.$otherDomain.'/renew', ['years' => 1, 'version' => 1])->assertNotFound();
        $this->getJson('/api/v1/admin/domains/'.$otherDomain.'/contacts')->assertNotFound();
        $this->postJson('/api/v1/admin/domains/'.$otherDomain.'/contacts', $this->contactPayload('tech'))->assertNotFound();
        $this->patchJson('/api/v1/admin/domains/'.$otherDomain.'/contacts/'.$otherContact, ['version' => 1, 'name' => 'Hack'])->assertNotFound();
        $this->deleteJson('/api/v1/admin/domains/'.$otherDomain.'/contacts/'.$otherContact)->assertNotFound();
        // Contacto ajeno colgado de mi dominio (IDOR por id de contacto).
        $this->patchJson('/api/v1/admin/domains/'.$domain['id'].'/contacts/'.$otherContact, ['version' => 1, 'name' => 'Hack'])->assertNotFound();
        $this->deleteJson('/api/v1/admin/domains/'.$domain['id'].'/contacts/'.$otherContact)->assertNotFound();
        // Mi contacto bajo un dominio ajeno.
        $this->patchJson('/api/v1/admin/domains/'.$otherDomain.'/contacts/'.$contact['id'], ['version' => 1, 'name' => 'Hack'])->assertNotFound();
        $this->assertSame('Ajeno', DB::table('domain_contacts')->where('id', $otherContact)->value('name'));
        $this->assertNull(DB::table('domains')->where('id', $otherDomain)->value('deleted_at'));

        // El listado y las tiles no mezclan organizaciones.
        $this->assertSame(['mio.com'], collect($this->getJson('/api/v1/admin/domains')->json('data'))->pluck('name')->all());
        $this->getJson('/api/v1/admin/domains/summary')->assertJsonPath('data.total', 1)->assertJsonPath('data.expiring_30d', 0);

        // Vínculos de otra organización -> 404 al crear y al editar.
        foreach (['customer_id' => $otherCustomer, 'service_id' => $otherService, 'provider_account_id' => $otherAccount] as $field => $value) {
            $this->postJson('/api/v1/admin/domains', ['name' => 'cruzado.com', 'holder' => 'company', $field => $value])->assertNotFound();
            $this->patchJson('/api/v1/admin/domains/'.$domain['id'], ['version' => 1, $field => $value])->assertNotFound();
        }
        $this->assertSame(0, DB::table('domains')->where('name', 'cruzado.com')->count());
        // El mismo nombre en otra organización no choca.
        $this->postJson('/api/v1/admin/domains', ['name' => 'ajeno.com', 'holder' => 'company'])->assertCreated();
    }

    public function test_authentication_and_permissions(): void
    {
        $domain = $this->make('permisos.com');
        $contact = $this->postJson('/api/v1/admin/domains/'.$domain['id'].'/contacts', $this->contactPayload())->assertCreated()->json('data');
        $id = $domain['id'];

        // Sin sesión: 401.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/v1/admin/domains')->assertUnauthorized();
        $this->getJson('/api/v1/admin/domains/summary')->assertUnauthorized();
        $this->postJson('/api/v1/admin/domains', ['name' => 'x.com', 'holder' => 'company'])->assertUnauthorized();
        $this->getJson("/api/v1/admin/domains/{$id}/contacts")->assertUnauthorized();

        // Cliente del portal (no staff): 403 aunque tenga sesión.
        $portal = $this->makeUser([], mfa: true, type: 'customer');
        $this->actAs($portal);
        $this->getJson('/api/v1/admin/domains')->assertForbidden();

        // Sin permisos de dominios (ventas): todo 403.
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actAs($sales);
        $this->assertProblem($this->getJson('/api/v1/admin/domains'), 403, 'forbidden');
        $this->getJson('/api/v1/admin/domains/summary')->assertForbidden();
        $this->getJson("/api/v1/admin/domains/{$id}")->assertForbidden();
        $this->getJson("/api/v1/admin/domains/{$id}/contacts")->assertForbidden();
        $this->postJson('/api/v1/admin/domains', ['name' => 'x.com', 'holder' => 'company'])->assertForbidden();

        // Solo lectura (documentación: domains.*.view): lee dominio y contactos, no escribe.
        $reader = $this->makeUser(['documentation'], mfa: true);
        $this->actAs($reader);
        $this->getJson('/api/v1/admin/domains')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/domains/summary')->assertOk();
        $this->getJson("/api/v1/admin/domains/{$id}")->assertOk()->assertJsonCount(1, 'data.contacts');
        $this->getJson("/api/v1/admin/domains/{$id}/contacts")->assertOk();
        $this->postJson('/api/v1/admin/domains', ['name' => 'x.com', 'holder' => 'company'])->assertForbidden();
        $this->patchJson("/api/v1/admin/domains/{$id}", ['version' => 1, 'privacy' => true])->assertForbidden();
        $this->postJson("/api/v1/admin/domains/{$id}/renew", ['years' => 1, 'version' => 1])->assertForbidden();
        $this->deleteJson("/api/v1/admin/domains/{$id}")->assertForbidden();
        $this->postJson("/api/v1/admin/domains/{$id}/contacts", $this->contactPayload('tech'))->assertForbidden();
        $this->patchJson("/api/v1/admin/domains/{$id}/contacts/{$contact['id']}", ['version' => 1, 'name' => 'X'])->assertForbidden();
        $this->deleteJson("/api/v1/admin/domains/{$id}/contacts/{$contact['id']}")->assertForbidden();

        // Soporte (domains.*): gestiona dominios y contactos.
        $support = $this->makeUser(['support'], mfa: true);
        $this->actAs($support);
        $this->postJson('/api/v1/admin/domains', ['name' => 'soporte.com', 'holder' => 'company'])->assertCreated();
        $this->patchJson("/api/v1/admin/domains/{$id}", ['version' => 1, 'privacy' => true])->assertOk();
        $this->deleteJson("/api/v1/admin/domains/{$id}/contacts/{$contact['id']}")->assertNoContent();
        $this->deleteJson("/api/v1/admin/domains/{$id}")->assertNoContent();

        // Los contactos no se filtran en el detalle sin domains.domain_contact.view.
        $this->assertSame(0, DB::table('domain_contacts')->where('domain_id', $id)->count());
    }
}
