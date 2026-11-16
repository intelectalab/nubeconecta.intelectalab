<?php

declare(strict_types=1);

namespace Tests\Feature\Mail;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Módulo Mail (correo y SSL en modo manual): CRUD, renovación de certificados, DNS de solo lectura, filtros, aislamiento y permisos. */
final class MailSslTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $org;

    private string $brand;

    private string $customer;

    private string $customer2;

    private string $product;

    private int $seq = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $this->org = (string) DB::table('organizations')->value('id');
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora Mail SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'mail-a', 'name' => 'Mail A', 'portal_domain' => 'portal.mail-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Uno SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->customer2 = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Zeta Corp SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100047218', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $cat = (string) Str::uuid();
        $this->product = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $cat, 'organization_id' => $this->org, 'code' => 'correo', 'name' => 'Correo']);
        DB::table('products')->insert(['id' => $this->product, 'organization_id' => $this->org, 'code' => 'M1', 'category_id' => $cat, 'name' => 'Correo', 'billing_type' => 'recurring']);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function otherOrgId(): string
    {
        $id = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $id, 'name' => 'Otra organización de correo', 'slug' => 'otra-correo-'.substr($id, 0, 6)]);
        return $id;
    }

    private function service(string $customer, ?string $org = null): string
    {
        $id = (string) Str::uuid();
        $n = ++$this->seq;
        DB::table('services')->insert([
            'id' => $id, 'organization_id' => $org ?? $this->org, 'code' => "SRV-ML{$n}", 'customer_id' => $customer, 'brand_id' => $this->brand,
            'product_id' => $this->product, 'label' => "correo{$n}", 'status' => 'active', 'activated_at' => now(),
        ]);
        return $id;
    }

    private function domain(string $name, ?string $customer = null): string
    {
        return $this->postJson('/api/v1/admin/domains', ['name' => $name, 'holder' => $customer === null ? 'company' : 'customer', 'customer_id' => $customer])->assertCreated()->json('data.id');
    }

    /** @return array<string, mixed> */
    private function mail(string $domain, array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/mail/services', $extra + ['domain_id' => $domain, 'provider_kind' => 'google_workspace'])->assertCreated()->json('data');
    }

    /** @return array<string, mixed> */
    private function cert(string $name, array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/mail/ssl-certificates', $extra + ['common_name' => $name, 'kind' => 'free_auto', 'renewal_mode' => 'automatic'])->assertCreated()->json('data');
    }

    public function test_mail_service_crud(): void
    {
        $domain = $this->domain('correo-uno.com', $this->customer);
        $service = $this->service($this->customer);
        $created = $this->postJson('/api/v1/admin/mail/services', [
            'domain_id' => $domain, 'provider_kind' => 'microsoft_365', 'service_id' => $service, 'plan' => 'Business Basic', 'tenant_id' => 'tenant-1',
            'seats_purchased' => 12, 'seats_used' => 10, 'seats_billed' => 8, 'renewal_date' => '2027-02-01',
        ])->assertCreated()
            ->assertJsonPath('data.provider_kind', 'microsoft_365')->assertJsonPath('data.status', 'active')->assertJsonPath('data.sync_mode', 'manual')
            ->assertJsonPath('data.account_owner', 'company')->assertJsonPath('data.domain.name', 'correo-uno.com')
            ->assertJsonPath('data.customer_id', $this->customer)->assertJsonPath('data.customer.name', 'Cliente Uno SAC')
            ->assertJsonPath('data.service.id', $service)->assertJsonPath('data.seats_difference', 2)
            ->assertJsonPath('data.renewal_date', '2027-02-01')->assertJsonPath('data.version', 1)->json('data');

        $this->getJson('/api/v1/admin/mail/services/'.$created['id'])->assertOk()->assertJsonPath('data.plan', 'Business Basic');

        $this->patchJson('/api/v1/admin/mail/services/'.$created['id'], ['version' => 1, 'seats_billed' => 10, 'status' => 'suspended', 'tenant_id' => null])
            ->assertOk()->assertJsonPath('data.seats_difference', 0)->assertJsonPath('data.status', 'suspended')->assertJsonPath('data.tenant_id', null)->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson('/api/v1/admin/mail/services/'.$created['id'], ['version' => 1, 'plan' => 'X']), 409, 'version_conflict');
        $this->assertSame('Business Basic', DB::table('mail_services')->where('id', $created['id'])->value('plan'));

        $this->deleteJson('/api/v1/admin/mail/services/'.$created['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/mail/services/'.$created['id'])->assertNotFound();
        $this->assertNotNull(DB::table('mail_services')->where('id', $created['id'])->value('deleted_at'));
    }

    public function test_mail_service_validation_and_links(): void
    {
        $domain = $this->domain('valida.com', $this->customer);
        $base = '/api/v1/admin/mail/services';
        $this->postJson($base, [])->assertStatus(422)->assertJsonValidationErrors(['domain_id', 'provider_kind']);
        $this->postJson($base, ['domain_id' => 'no-uuid', 'provider_kind' => 'zimbra'])->assertStatus(422)->assertJsonValidationErrors(['domain_id', 'provider_kind']);
        $this->postJson($base, ['domain_id' => $domain, 'provider_kind' => 'cpanel', 'seats_used' => -1])->assertStatus(422)->assertJsonValidationErrors('seats_used');
        $this->postJson($base, ['domain_id' => $domain, 'provider_kind' => 'cpanel', 'status' => 'raro', 'account_owner' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['status', 'account_owner']);
        $this->postJson($base, ['domain_id' => $domain, 'provider_kind' => 'cpanel', 'renewal_date' => 'ayer'])->assertStatus(422)->assertJsonValidationErrors('renewal_date');
        // Falta la versión al editar.
        $mail = $this->mail($domain);
        $this->patchJson($base.'/'.$mail['id'], ['plan' => 'X'])->assertStatus(422)->assertJsonValidationErrors('version');
        // El servicio comercial debe ser del cliente del dominio.
        $foreign = $this->service($this->customer2);
        $this->postJson($base, ['domain_id' => $domain, 'provider_kind' => 'cpanel', 'service_id' => $foreign])->assertStatus(422)->assertJsonValidationErrors('service_id');
        $this->patchJson($base.'/'.$mail['id'], ['version' => 1, 'service_id' => $foreign])->assertStatus(422)->assertJsonValidationErrors('service_id');
        // Id inexistente -> 404.
        $this->postJson($base, ['domain_id' => (string) Str::uuid(), 'provider_kind' => 'cpanel'])->assertNotFound();
        $this->assertSame(1, DB::table('mail_services')->count());
    }

    public function test_mail_filters_and_summary_return_exact_subsets(): void
    {
        $today = now();
        $d1 = $this->domain('uno.com', $this->customer);
        $d2 = $this->domain('dos.com', $this->customer2);
        $d3 = $this->domain('tres.com');
        $this->mail($d1, ['plan' => 'Starter', 'seats_used' => 5, 'seats_billed' => 3, 'renewal_date' => $today->toDateString()]);
        $this->mail($d1, ['provider_kind' => 'microsoft_365', 'seats_used' => 4, 'seats_billed' => 4, 'renewal_date' => $today->copy()->addDays(30)->toDateString()]);
        $this->mail($d2, ['provider_kind' => 'cpanel', 'seats_used' => 2, 'seats_billed' => 6, 'renewal_date' => $today->copy()->addDays(31)->toDateString(), 'account_owner' => 'customer']);
        $this->mail($d3, ['provider_kind' => 'other', 'renewal_date' => $today->copy()->subDay()->toDateString(), 'status' => 'cancelled']);
        $this->mail($d3, ['seats_used' => 1]);

        $domains = fn (string $qs) => collect($this->getJson('/api/v1/admin/mail/services?'.$qs)->assertOk()->json('data'))->pluck('domain.name')->sort()->values()->all();

        $this->assertCount(5, $domains(''));
        $this->assertSame(['dos.com'], $domains('provider_kind=cpanel'));
        $this->assertSame(['dos.com', 'uno.com'], $domains('with_difference=1'));
        $this->assertSame(['uno.com', 'uno.com'], $domains('customer_id='.$this->customer));
        $this->assertSame(['dos.com'], $domains('customer_id='.$this->customer2));
        $this->assertSame(['tres.com', 'tres.com'], $domains('domain_id='.$d3));
        $this->assertSame(['tres.com'], $domains('status=cancelled'));
        $this->assertSame(['dos.com'], $domains('account_owner=customer'));
        $this->assertSame(['uno.com', 'uno.com'], $domains('renewing_30d=1'));
        $this->assertSame(['uno.com'], $domains('renewing_30d=1&provider_kind=microsoft_365'));
        $this->assertSame(['uno.com'], $domains('search=starter'));
        $this->assertSame(['dos.com'], $domains('search=zeta'));
        $this->assertSame([], $domains('search=%25'));
        $this->assertCount(5, $domains('domain_id=no-uuid&customer_id=zzz&provider_kind=otro&status=raro'));
        // Orden y paginación por cursor.
        $page = $this->getJson('/api/v1/admin/mail/services?page[size]=2&sort=renewal_date')->assertOk();
        $this->assertCount(2, $page->json('data'));
        $this->assertTrue($page->json('meta.has_more'));
        $this->getJson('/api/v1/admin/mail/services?sort=password')->assertStatus(400);

        $this->getJson('/api/v1/admin/mail/summary')->assertOk()
            ->assertJsonPath('data.mail.total', 5)->assertJsonPath('data.mail.with_difference', 2)
            ->assertJsonPath('data.mail.under_billed', 1)->assertJsonPath('data.mail.renewing_30d', 2)
            ->assertJsonPath('data.ssl.total', 0);
    }

    public function test_dns_checks_are_listed_read_only(): void
    {
        $domain = $this->domain('dns.com', $this->customer);
        $a = $this->mail($domain)['id'];
        $b = $this->mail($domain)['id'];
        foreach ([[$a, 'MX', 'ok', '2026-11-01 10:00:00'], [$a, 'SPF', 'missing', '2026-11-02 10:00:00'], [$a, 'DKIM', 'changed', '2026-11-03 10:00:00'], [$b, 'DMARC', 'invalid', '2026-11-04 10:00:00']] as [$svc, $type, $result, $at]) {
            DB::table('mail_dns_checks')->insert(['id' => (string) Str::uuid(), 'organization_id' => $this->org, 'mail_service_id' => $svc, 'record_type' => $type, 'expected' => 'v=spf1', 'observed' => null, 'result' => $result, 'checked_at' => $at]);
        }
        $list = $this->getJson("/api/v1/admin/mail/services/{$a}/dns-checks")->assertOk()->assertJsonCount(3, 'data');
        $this->assertSame(['DKIM', 'SPF', 'MX'], collect($list->json('data'))->pluck('record_type')->all());
        $list->assertJsonPath('data.0.result', 'changed')->assertJsonPath('data.0.mail_service_id', $a)->assertJsonPath('data.0.expected', 'v=spf1');
        $this->assertCount(1, $this->getJson("/api/v1/admin/mail/services/{$a}/dns-checks?record_type=SPF")->json('data'));
        $this->assertCount(1, $this->getJson("/api/v1/admin/mail/services/{$a}/dns-checks?result=ok")->json('data'));
        $this->assertCount(3, $this->getJson("/api/v1/admin/mail/services/{$a}/dns-checks?record_type=ZZZ")->json('data'));
        $this->assertCount(1, $this->getJson("/api/v1/admin/mail/services/{$b}/dns-checks")->json('data'));
        // Sin escritura.
        $this->postJson("/api/v1/admin/mail/services/{$a}/dns-checks", [])->assertStatus(405);
    }

    public function test_ssl_certificate_crud(): void
    {
        $domain = $this->domain('cert.com', $this->customer);
        $service = $this->service($this->customer);
        $created = $this->postJson('/api/v1/admin/mail/ssl-certificates', [
            'common_name' => 'WWW.Cert.com', 'covered_names' => ['WWW.cert.com', 'cert.com', 'cert.com'], 'kind' => 'paid', 'issuer' => 'Sectigo',
            'renewal_mode' => 'manual', 'domain_id' => $domain, 'service_id' => $service, 'issued_at' => '2026-01-10', 'expires_at' => '2027-01-10',
            'cost_minor' => 5000, 'cost_currency' => 'USD', 'price_minor' => 9000, 'currency' => 'PEN',
            'installed_on_type' => 'cdn', 'responsible_user_id' => $this->admin->id,
        ])->assertCreated()
            ->assertJsonPath('data.common_name', 'www.cert.com')->assertJsonPath('data.covered_names', ['www.cert.com', 'cert.com'])
            ->assertJsonPath('data.kind', 'paid')->assertJsonPath('data.status', 'valid')->assertJsonPath('data.auto_renew', false)
            ->assertJsonPath('data.expires_at', '2027-01-10')->assertJsonPath('data.domain.name', 'cert.com')
            ->assertJsonPath('data.customer.name', 'Cliente Uno SAC')->assertJsonPath('data.service.id', $service)
            ->assertJsonPath('data.cost_minor', 5000)->assertJsonPath('data.version', 1)->json('data');

        $this->getJson('/api/v1/admin/mail/ssl-certificates/'.$created['id'])->assertOk()->assertJsonPath('data.issuer', 'Sectigo');

        $this->patchJson('/api/v1/admin/mail/ssl-certificates/'.$created['id'], ['version' => 1, 'renewal_mode' => 'automatic', 'covered_names' => []])
            ->assertOk()->assertJsonPath('data.auto_renew', true)->assertJsonPath('data.covered_names', [])->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson('/api/v1/admin/mail/ssl-certificates/'.$created['id'], ['version' => 1, 'issuer' => 'X']), 409, 'version_conflict');

        // Comodín por nombre.
        $this->cert('*.wild.com');
        $this->assertTrue((bool) DB::table('ssl_certificates')->where('common_name', '*.wild.com')->value('is_wildcard'));

        $this->deleteJson('/api/v1/admin/mail/ssl-certificates/'.$created['id'])->assertNoContent();
        $this->getJson('/api/v1/admin/mail/ssl-certificates/'.$created['id'])->assertNotFound();
        $this->assertNotNull(DB::table('ssl_certificates')->where('id', $created['id'])->value('deleted_at'));
    }

    public function test_ssl_validation(): void
    {
        $base = '/api/v1/admin/mail/ssl-certificates';
        $this->postJson($base, [])->assertStatus(422)->assertJsonValidationErrors(['common_name', 'kind', 'renewal_mode']);
        $this->postJson($base, ['common_name' => 'no es host', 'kind' => 'gratis', 'renewal_mode' => 'x'])->assertStatus(422)->assertJsonValidationErrors(['common_name', 'kind', 'renewal_mode']);
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'covered_names' => ['bad name']])->assertStatus(422)->assertJsonValidationErrors('covered_names.0');
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'issued_at' => '2026-05-01', 'expires_at' => '2026-04-01'])->assertStatus(422)->assertJsonValidationErrors('expires_at');
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'status' => 'raro', 'installed_on_type' => 'luna'])->assertStatus(422)->assertJsonValidationErrors(['status', 'installed_on_type']);
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'currency' => 'EUR', 'price_minor' => 1])->assertStatus(422)->assertJsonValidationErrors('currency');
        // Monto y moneda juntos.
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'cost_minor' => 100])->assertStatus(422)->assertJsonValidationErrors('cost_currency');
        // Proveedor de compra solo en certificados de pago.
        $account = (string) Str::uuid();
        $provider = (string) Str::uuid();
        DB::table('providers')->insert(['id' => $provider, 'organization_id' => $this->org, 'code' => 'ssl-prov', 'name' => 'SSLCo', 'type' => 'registrar']);
        DB::table('provider_accounts')->insert(['id' => $account, 'organization_id' => $this->org, 'provider_id' => $provider, 'label' => 'ssl']);
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'purchase_provider_account_id' => $account])->assertStatus(422)->assertJsonValidationErrors('purchase_provider_account_id');
        $this->postJson($base, ['common_name' => 'a.com', 'kind' => 'paid', 'renewal_mode' => 'manual', 'purchase_provider_account_id' => $account])->assertCreated();
        // Responsable de otra organización: no existe en mi scope.
        $this->postJson($base, ['common_name' => 'b.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'responsible_user_id' => (string) Str::uuid()])->assertStatus(422)->assertJsonValidationErrors('responsible_user_id');
        // Servicio de otro cliente que el del dominio.
        $domain = $this->domain('c.com', $this->customer);
        $this->postJson($base, ['common_name' => 'c.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', 'domain_id' => $domain, 'service_id' => $this->service($this->customer2)])->assertStatus(422)->assertJsonValidationErrors('service_id');
    }

    public function test_renew_resets_the_validity_window_from_today(): void
    {
        $today = now()->startOfDay();
        $free = $this->cert('gratis.com', ['kind' => 'free_auto', 'issued_at' => '2026-01-01', 'expires_at' => '2026-03-31', 'status' => 'expired']);
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$free['id'].'/renew', ['version' => 1])
            ->assertOk()->assertJsonPath('data.issued_at', $today->toDateString())
            ->assertJsonPath('data.expires_at', $today->copy()->addDays(90)->toDateString())
            ->assertJsonPath('data.status', 'valid')->assertJsonPath('data.version', 2);
        $this->assertSame($today->copy()->addDays(90)->toDateString(), DB::table('ssl_certificates')->where('id', $free['id'])->value('expires_at'));

        $paid = $this->cert('pago.com', ['kind' => 'paid', 'renewal_mode' => 'manual', 'expires_at' => '2026-12-01']);
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$paid['id'].'/renew', ['version' => 1])
            ->assertOk()->assertJsonPath('data.expires_at', $today->copy()->addDays(365)->toDateString());
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$paid['id'].'/renew', ['version' => 2, 'days' => 30])
            ->assertOk()->assertJsonPath('data.expires_at', $today->copy()->addDays(30)->toDateString());

        // Un certificado revocado sigue revocado.
        $revoked = $this->cert('revocado.com', ['status' => 'revoked']);
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$revoked['id'].'/renew', ['version' => 1])->assertOk()->assertJsonPath('data.status', 'revoked');

        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$free['id'].'/renew', ['version' => 2, 'days' => 0])->assertStatus(422)->assertJsonValidationErrors('days');
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$free['id'].'/renew', ['version' => 2, 'days' => 826])->assertStatus(422)->assertJsonValidationErrors('days');
        $this->postJson('/api/v1/admin/mail/ssl-certificates/'.$free['id'].'/renew', [])->assertStatus(422)->assertJsonValidationErrors('version');
        $this->assertProblem($this->postJson('/api/v1/admin/mail/ssl-certificates/'.$free['id'].'/renew', ['version' => 1]), 409, 'version_conflict');
    }

    public function test_ssl_filters_and_summary_return_exact_subsets(): void
    {
        $today = now();
        $d1 = $this->domain('uno.com', $this->customer);
        $svc2 = $this->service($this->customer2);
        $this->cert('hoy.uno.com', ['expires_at' => $today->toDateString(), 'domain_id' => $d1, 'issuer' => "Let's Encrypt"]);
        $this->cert('en30.com', ['expires_at' => $today->copy()->addDays(30)->toDateString(), 'kind' => 'paid', 'renewal_mode' => 'manual', 'service_id' => $svc2]);
        $this->cert('en31.com', ['expires_at' => $today->copy()->addDays(31)->toDateString()]);
        $this->cert('ayer.com', ['expires_at' => $today->copy()->subDay()->toDateString(), 'status' => 'expired', 'renewal_mode' => 'manual']);
        $this->cert('sinfecha.com', ['kind' => 'paid', 'status' => 'revoked']);

        $names = fn (string $qs) => collect($this->getJson('/api/v1/admin/mail/ssl-certificates?'.$qs)->assertOk()->json('data'))->pluck('common_name')->sort()->values()->all();

        $this->assertCount(5, $names(''));
        $this->assertSame(['en30.com', 'hoy.uno.com'], $names('expiring_30d=1'));
        $this->assertSame(['en30.com', 'sinfecha.com'], $names('kind=paid'));
        $this->assertSame(['ayer.com', 'en30.com'], $names('renewal_mode=manual'));
        $this->assertSame(['ayer.com'], $names('renewal_mode=manual&kind=free_auto'));
        $this->assertSame(['ayer.com'], $names('status=expired'));
        $this->assertSame(['hoy.uno.com'], $names('domain_id='.$d1));
        $this->assertSame(['hoy.uno.com'], $names('customer_id='.$this->customer));
        $this->assertSame(['en30.com'], $names('customer_id='.$this->customer2));
        $this->assertSame(['en30.com'], $names('service_id='.$svc2));
        $this->assertSame(['en30.com', 'en31.com'], $names('search=EN3'));
        $this->assertSame(['hoy.uno.com'], $names("search=let's"));
        $this->assertSame([], $names('search=%25'));
        $this->assertCount(5, $names('domain_id=no-uuid&kind=otro&status=raro&renewal_mode=x'));

        $this->getJson('/api/v1/admin/mail/summary')->assertOk()
            ->assertJsonPath('data.ssl.total', 5)->assertJsonPath('data.ssl.expiring_30d', 2)
            ->assertJsonPath('data.ssl.expired', 1)->assertJsonPath('data.ssl.manual_renewal', 2);
    }

    public function test_organization_isolation(): void
    {
        $mine = $this->mail($this->domain('mio.com', $this->customer));
        $myCert = $this->cert('mio.com');

        $other = $this->otherOrgId();
        $otherCustomer = (string) Str::uuid();
        DB::table('customers')->insert(['id' => $otherCustomer, 'organization_id' => $other, 'code' => 'CLI-OTRA1', 'type' => 'company', 'legal_name' => 'Ajena SAC', 'normalized_name' => 'ajena sac', 'origin_brand_id' => $this->brand, 'country' => 'PE', 'currency' => 'PEN']);
        $otherService = $this->service($otherCustomer, $other);
        $otherDomain = (string) Str::uuid();
        DB::table('domains')->insert(['id' => $otherDomain, 'organization_id' => $other, 'name' => 'ajeno.com', 'tld' => 'com', 'holder' => 'company']);
        $otherMail = (string) Str::uuid();
        DB::table('mail_services')->insert(['id' => $otherMail, 'organization_id' => $other, 'domain_id' => $otherDomain, 'provider_kind' => 'cpanel', 'renewal_date' => now()->addDays(3)->toDateString(), 'seats_used' => 9, 'seats_billed' => 1]);
        DB::table('mail_dns_checks')->insert(['id' => (string) Str::uuid(), 'organization_id' => $other, 'mail_service_id' => $otherMail, 'record_type' => 'MX', 'result' => 'ok']);
        $otherCert = (string) Str::uuid();
        DB::table('ssl_certificates')->insert(['id' => $otherCert, 'organization_id' => $other, 'common_name' => 'ajeno.com', 'kind' => 'paid', 'renewal_mode' => 'manual', 'expires_at' => now()->addDays(3)->toDateString()]);

        $m = '/api/v1/admin/mail/services/';
        $s = '/api/v1/admin/mail/ssl-certificates/';
        $this->getJson($m.$otherMail)->assertNotFound();
        $this->patchJson($m.$otherMail, ['version' => 1, 'plan' => 'Hack'])->assertNotFound();
        $this->deleteJson($m.$otherMail)->assertNotFound();
        $this->getJson($m.$otherMail.'/dns-checks')->assertNotFound();
        $this->getJson($s.$otherCert)->assertNotFound();
        $this->patchJson($s.$otherCert, ['version' => 1, 'issuer' => 'Hack'])->assertNotFound();
        $this->postJson($s.$otherCert.'/renew', ['version' => 1])->assertNotFound();
        $this->deleteJson($s.$otherCert)->assertNotFound();
        $this->assertNull(DB::table('mail_services')->where('id', $otherMail)->value('deleted_at'));
        $this->assertNull(DB::table('ssl_certificates')->where('id', $otherCert)->value('deleted_at'));
        $this->assertNull(DB::table('ssl_certificates')->where('id', $otherCert)->value('issuer'));

        // Listados y tiles no mezclan organizaciones.
        $this->assertSame([$mine['id']], collect($this->getJson('/api/v1/admin/mail/services')->json('data'))->pluck('id')->all());
        $this->assertSame([$myCert['id']], collect($this->getJson('/api/v1/admin/mail/ssl-certificates')->json('data'))->pluck('id')->all());
        $this->getJson('/api/v1/admin/mail/summary')->assertJsonPath('data.mail.total', 1)->assertJsonPath('data.mail.with_difference', 0)->assertJsonPath('data.ssl.total', 1)->assertJsonPath('data.ssl.expiring_30d', 0);

        // Vínculos de otra organización -> 404 al crear y al editar.
        foreach (['domain_id' => $otherDomain, 'service_id' => $otherService] as $field => $value) {
            $this->postJson('/api/v1/admin/mail/services', ['domain_id' => $this->domain('x'.str_replace('_', '', $field).'.com'), 'provider_kind' => 'cpanel', $field => $value])->assertNotFound();
            $this->patchJson($m.$mine['id'], ['version' => 1, $field => $value])->assertNotFound();
            $this->postJson('/api/v1/admin/mail/ssl-certificates', ['common_name' => 'cruzado.com', 'kind' => 'free_auto', 'renewal_mode' => 'manual', $field => $value])->assertNotFound();
            $this->patchJson($s.$myCert['id'], ['version' => 1, $field => $value])->assertNotFound();
        }
        $this->assertSame(0, DB::table('ssl_certificates')->where('common_name', 'cruzado.com')->count());
    }

    public function test_authentication_and_permissions(): void
    {
        $mail = $this->mail($this->domain('permisos.com'));
        $cert = $this->cert('permisos.com');
        $m = '/api/v1/admin/mail/services';
        $s = '/api/v1/admin/mail/ssl-certificates';
        $mid = $mail['id'];
        $cid = $cert['id'];

        // Sin sesión: 401.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->getJson($m)->assertUnauthorized();
        $this->getJson($s)->assertUnauthorized();
        $this->getJson('/api/v1/admin/mail/summary')->assertUnauthorized();
        $this->getJson("{$m}/{$mid}/dns-checks")->assertUnauthorized();
        $this->postJson($s, [])->assertUnauthorized();

        // Cliente del portal (no staff): 403.
        $this->actAs($this->makeUser([], mfa: true, type: 'customer'));
        $this->getJson($m)->assertForbidden();

        // Ventas: sin permisos de correo.
        $this->actAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->getJson($m), 403, 'forbidden');
        $this->getJson($s)->assertForbidden();
        $this->getJson('/api/v1/admin/mail/summary')->assertForbidden();
        $this->getJson("{$m}/{$mid}/dns-checks")->assertForbidden();
        $this->postJson($m, ['domain_id' => (string) Str::uuid(), 'provider_kind' => 'cpanel'])->assertForbidden();

        // Documentación (mail.*.view): solo lectura.
        $this->actAs($this->makeUser(['documentation'], mfa: true));
        $this->getJson($m)->assertOk()->assertJsonCount(1, 'data');
        $this->getJson($s)->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/mail/summary')->assertOk();
        $this->getJson("{$m}/{$mid}")->assertOk();
        $this->getJson("{$m}/{$mid}/dns-checks")->assertOk();
        $this->postJson($m, ['domain_id' => (string) Str::uuid(), 'provider_kind' => 'cpanel'])->assertForbidden();
        $this->patchJson("{$m}/{$mid}", ['version' => 1, 'plan' => 'X'])->assertForbidden();
        $this->deleteJson("{$m}/{$mid}")->assertForbidden();
        $this->postJson($s, ['common_name' => 'x.com', 'kind' => 'paid', 'renewal_mode' => 'manual'])->assertForbidden();
        $this->patchJson("{$s}/{$cid}", ['version' => 1, 'issuer' => 'X'])->assertForbidden();
        $this->postJson("{$s}/{$cid}/renew", ['version' => 1])->assertForbidden();
        $this->deleteJson("{$s}/{$cid}")->assertForbidden();

        // Soporte (mail.*): gestiona.
        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->patchJson("{$m}/{$mid}", ['version' => 1, 'plan' => 'Soporte'])->assertOk();
        $this->postJson("{$s}/{$cid}/renew", ['version' => 1])->assertOk();
        $this->deleteJson("{$s}/{$cid}")->assertNoContent();
        $this->deleteJson("{$m}/{$mid}")->assertNoContent();
    }
}
