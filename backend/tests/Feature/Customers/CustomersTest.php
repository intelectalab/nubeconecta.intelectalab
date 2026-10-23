<?php

declare(strict_types=1);

namespace Tests\Feature\Customers;

use App\Models\User;
use App\Modules\Customers\Events\CommunicationConsentChanged;
use App\Modules\Customers\Events\CustomerCreated;
use App\Modules\Customers\Events\CustomerFiscalDataChanged;
use App\Modules\Customers\Events\CustomersMerged;
use App\Modules\Customers\Jobs\ExportPersonalData;
use App\Modules\Customers\Models\Contact;
use App\Modules\Customers\Support\TaxIdValidator;
use App\Modules\Customers\Support\UnsubscribeToken;
use App\Shared\Contracts\CommunicationPreferences;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Criterios de terminado de M-CUS §13 y reglas de §5. */
final class CustomersTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $entity;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'Marca A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
    }

    /** Cambia de usuario sin arrastrar el usuario memorizado por los guards de peticiones anteriores. */
    private function actAs(User $user): void
    {
        // Sanctum guarda password_hash_web en la sesión: cada usuario usa su propia sesión.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    /** RUC válido con prefijo 20 y dígito verificador calculado. */
    private static function ruc(int $n): string
    {
        $base = '20'.str_pad((string) $n, 8, '0', STR_PAD_LEFT);
        $sum = 0;
        foreach ([5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as $i => $w) {
            $sum += ((int) $base[$i]) * $w;
        }
        $check = 11 - ($sum % 11);

        return $base.($check === 10 ? 0 : ($check === 11 ? 1 : $check));
    }

    /** @param array<string, mixed> $extra */
    private function customer(string $name, string $ruc, array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/customers', $extra + [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $ruc,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data');
    }

    public function test_ruc_validation_duplicates_code_and_events(): void
    {
        $this->assertTrue(TaxIdValidator::isValidRuc('20100070970'));
        $this->assertFalse(TaxIdValidator::isValidRuc('20100070971'));
        Event::fake([CustomerCreated::class]);

        $bad = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Mala SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070971', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand]);
        $this->assertProblem($bad, 422, 'validation_failed');
        $this->assertArrayHasKey('tax_id', $bad->json('errors'));

        $a = $this->customer('Acme Perú S.A.C.', self::ruc(1), ['email' => 'Info@Acme.pe']);
        $this->assertMatchesRegularExpression('/^CLI-\d{6}$/', $a['code']);
        Event::assertDispatched(CustomerCreated::class);

        // Mismo documento (con puntos y espacios): se muestra el duplicado y no se crea, ni confirmando.
        $dup = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Otra', 'tax_id_type' => 'ruc', 'tax_id' => ' '.self::ruc(1), 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand, 'confirm_duplicates' => true]);
        $this->assertProblem($dup, 409, 'duplicate_customer');
        $this->assertSame($a['id'], $dup->json('duplicates.0.id'));
        $this->assertSame(1, DB::table('customers')->count());

        // Nombre parecido: aviso de posible duplicado; con confirmación se crea.
        $this->assertProblem($this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'ACME PERU SAC', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand]), 409, 'possible_duplicate');
        $this->getJson('/api/v1/admin/customers/duplicates?legal_name=acme peru&email=info@acme.pe')->assertOk()->assertJsonPath('data.0.id', $a['id']);
        $this->customer('Acme Peru', self::ruc(2), ['confirm_duplicates' => true]);

        // Listado con búsqueda, filtro y cursor.
        $this->customer('Beta EIRL', self::ruc(3));
        $page = $this->getJson('/api/v1/admin/customers?page[size]=2&sort=legal_name')->assertOk();
        $this->assertCount(2, $page->json('data'));
        $this->assertNotNull($cursor = $page->json('meta.next_cursor') ?? $page->json('links.next'));
        $this->getJson('/api/v1/admin/customers?q=beta&filter[country]=pe')->assertOk()->assertJsonCount(1, 'data');

        // Versión optimista y 403 sin permiso.
        $this->assertProblem($this->patchJson("/api/v1/admin/customers/{$a['id']}", ['version' => 99, 'trade_name' => 'X']), 409, 'version_conflict');
        $support = $this->makeUser(['support'], mfa: true);
        $this->actAs($support);
        $this->getJson("/api/v1/admin/customers/{$a['id']}")->assertOk()->assertJsonMissingPath('data.notes');
        $this->assertProblem($this->deleteJson("/api/v1/admin/customers/{$a['id']}"), 403, 'forbidden');
    }

    public function test_merge_moves_records_and_keeps_both_histories(): void
    {
        Event::fake([CustomersMerged::class]);
        $survivor = $this->customer('Gamma SAC', self::ruc(10));
        $absorbed = $this->customer('Gamma Duplicada', self::ruc(11), ['confirm_duplicates' => true]);
        $org = DB::table('organizations')->value('id');
        $this->postJson("/api/v1/admin/customers/{$absorbed['id']}/contacts", ['name' => 'Ana', 'email' => 'ana@gamma.pe', 'roles' => ['billing']])->assertCreated();
        $cat = (string) Str::uuid();
        DB::table('product_categories')->insert(['id' => $cat, 'organization_id' => $org, 'code' => 'hosting', 'name' => 'Hosting']);
        $product = (string) Str::uuid();
        DB::table('products')->insert(['id' => $product, 'organization_id' => $org, 'code' => 'H1', 'category_id' => $cat, 'name' => 'Hosting 1', 'billing_type' => 'recurring']);
        DB::table('services')->insert(['organization_id' => $org, 'code' => 'SRV-1', 'customer_id' => $absorbed['id'], 'brand_id' => $this->brand, 'product_id' => $product, 'label' => 'gamma.pe']);
        DB::table('invoices')->insert(['organization_id' => $org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $absorbed['id'], 'type' => 'invoice', 'currency' => 'PEN']);
        DB::table('tickets')->insert(['organization_id' => $org, 'number' => 'TCK-1', 'channel' => 'email', 'subject' => 'Ayuda', 'customer_id' => $absorbed['id']]);

        $preview = $this->getJson("/api/v1/admin/customers/merge-preview?survivor_id={$survivor['id']}&absorbed_id={$absorbed['id']}")->assertOk();
        $this->assertSame(1, $preview->json('data.counts.absorbed.services'));

        $body = ['survivor_id' => $survivor['id'], 'absorbed_id' => $absorbed['id'], 'survivor_version' => $survivor['version'], 'absorbed_version' => $absorbed['version'], 'fields' => ['trade_name' => 'absorbed']];
        $this->assertProblem($this->postJson('/api/v1/admin/customers/merge', $body + ['confirm_code' => 'CLI-999999']), 422, 'validation_failed');
        $this->postJson('/api/v1/admin/customers/merge', $body + ['confirm_code' => $absorbed['code']])->assertOk()->assertJsonPath('data.id', $survivor['id']);
        Event::assertDispatched(CustomersMerged::class);

        foreach (['services', 'invoices', 'tickets', 'contacts'] as $table) {
            $this->assertSame(1, DB::table($table)->where('customer_id', $survivor['id'])->count(), $table);
            $this->assertSame(0, DB::table($table)->where('customer_id', $absorbed['id'])->count(), $table);
        }
        $this->assertProblem($this->getJson("/api/v1/admin/customers/{$absorbed['id']}"), 404, 'customer_merged');
        $this->assertProblem($this->postJson('/api/v1/admin/customers/merge', $body + ['confirm_code' => $absorbed['code']]), 409, 'already_merged');

        // El historial del sobreviviente incluye la auditoría del absorbido.
        $history = collect($this->getJson("/api/v1/admin/customers/{$survivor['id']}/history?page[size]=100")->assertOk()->json('data'));
        $this->assertTrue($history->contains(fn ($e) => $e['customer_id'] === $absorbed['id'] && $e['action'] === 'customer.created'));
        $this->assertTrue($history->contains(fn ($e) => $e['action'] === 'customer.merged'));
    }

    /** @return array{customer: array<string, mixed>, contact: string, user: User} */
    private function portalCustomer(string $role = 'customer_admin'): array
    {
        $customer = $this->customer('Delta SAC', self::ruc(20), ['account_manager_id' => $this->admin->id]);
        $this->postJson("/api/v1/admin/customers/{$customer['id']}/notes", ['body' => 'Nota interna secreta'])->assertCreated();
        $contact = $this->postJson("/api/v1/admin/customers/{$customer['id']}/contacts", ['name' => 'Luis', 'email' => 'luis@delta.pe', 'roles' => ['administrative'], 'portal_role' => $role])->assertCreated()->json('data');
        $user = User::query()->findOrFail(Contact::query()->findOrFail($contact['id'])->user_id);

        return ['customer' => $customer, 'contact' => $contact['id'], 'user' => $user];
    }

    public function test_portal_contract_hides_internal_data_and_audits_fiscal_change(): void
    {
        Event::fake([CustomerFiscalDataChanged::class]);
        ['customer' => $customer, 'user' => $user] = $this->portalCustomer();
        $other = $this->customer('Ajeno SAC', self::ruc(21));
        $otherContact = $this->postJson("/api/v1/admin/customers/{$other['id']}/contacts", ['name' => 'Otro', 'email' => 'otro@ajeno.pe'])->assertCreated()->json('data.id');

        $this->actAs($user);
        $this->assertProblem($this->getJson('/api/v1/admin/customers'), 403, 'forbidden');
        $account = $this->getJson('/api/v1/portal/account')->assertOk()->assertJsonPath('data.id', $customer['id']);
        $json = json_encode($account->json());
        foreach (['account_manager_id', 'customer_notes', 'notes', 'profitability', 'origin_brand_id', 'Nota interna secreta'] as $forbidden) {
            $this->assertStringNotContainsString($forbidden, $json);
        }
        $this->assertSame(array_merge(\App\Modules\Customers\Http\Resources\PortalCustomerResource::FIELDS, ['custom']), array_keys($account->json('data')));

        // Solo su propio cliente: un contacto ajeno responde 404.
        $this->assertProblem($this->patchJson("/api/v1/portal/contacts/{$otherContact}", ['version' => 1, 'name' => 'X']), 404, 'not_found');

        $this->patchJson('/api/v1/portal/account', ['version' => $account->json('data.version'), 'legal_name' => 'Delta Nueva SAC', 'address' => 'Av. Lima 123'])->assertOk();
        $audit = DB::table('audit_events')->where('action', 'customer.fiscal_data_changed')->where('entity_id', $customer['id'])->first();
        $this->assertNotNull($audit);
        $this->assertSame('Delta SAC', json_decode($audit->before, true)['legal_name']);
        $this->assertSame('Delta Nueva SAC', json_decode($audit->after, true)['legal_name']);
        $this->assertSame('portal', json_decode($audit->metadata, true)['origin']);
        $this->assertSame($user->id, $audit->actor_id);
        Event::assertDispatched(CustomerFiscalDataChanged::class);

        // customer_user no edita la cuenta.
        $this->actAs($this->admin);
        $viewer = $this->postJson("/api/v1/admin/customers/{$customer['id']}/contacts", ['name' => 'Eva', 'email' => 'eva@delta.pe', 'portal_role' => 'customer_user'])->assertCreated()->json('data.id');
        $this->actAs(User::query()->findOrFail(Contact::query()->findOrFail($viewer)->user_id));
        $this->assertProblem($this->patchJson('/api/v1/portal/account', ['version' => 2, 'legal_name' => 'Y']), 403, 'forbidden');
    }

    public function test_opt_out_on_one_channel_blocks_all_marketing_but_not_transactional(): void
    {
        Event::fake([CommunicationConsentChanged::class]);
        ['contact' => $contact, 'user' => $user] = $this->portalCustomer('customer_user');
        $prefs = $this->app->make(CommunicationPreferences::class);

        $this->postJson("/api/v1/admin/contacts/{$contact}/communication-consents", ['channel' => 'all', 'granted' => true, 'source' => 'form'])->assertCreated();
        $this->assertTrue($prefs->maySend($contact, 'whatsapp'));

        $this->actAs($user);
        $this->postJson('/api/v1/portal/communication-consents', ['channel' => 'sms', 'granted' => false])->assertCreated()->assertJsonPath('data.marketing_allowed_channels', []);
        Event::assertDispatched(CommunicationConsentChanged::class);
        foreach (['email', 'whatsapp', 'sms', 'phone'] as $channel) {
            $this->assertFalse($prefs->maySend($contact, $channel, 'marketing'), $channel);
            $this->assertTrue($prefs->maySend($contact, $channel, 'transactional'), $channel);
        }

        // Baja por enlace público y por correo (Elastic Email vía SAL/AUT).
        $this->actAs($this->admin);
        $this->postJson("/api/v1/admin/contacts/{$contact}/communication-consents", ['channel' => 'email', 'granted' => true])->assertCreated();
        $this->assertTrue($prefs->maySend($contact, 'email'));
        $token = UnsubscribeToken::for(Contact::query()->findOrFail($contact));
        $this->postJson('/api/v1/public/communication-unsubscribes', ['token' => $token])->assertStatus(202);
        $this->assertFalse($prefs->maySend($contact, 'email'));
        $this->postJson('/api/v1/public/communication-unsubscribes', ['token' => 'falso.token'])->assertStatus(202);
        $this->assertSame(1, $prefs->recordUnsubscribeByEmail('LUIS@delta.pe'));
    }

    public function test_import_400_customers_with_5_invalid_rows(): void
    {
        $lines = [implode(',', \App\Modules\Customers\Services\CustomerImporter::CUSTOMER_COLUMNS)];
        $invalid = [7 => 'ruc-malo', 50 => 'sin-nombre', 120 => 'pais', 300 => 'moneda', 399 => 'repetido'];
        for ($i = 1; $i <= 400; $i++) {
            $ruc = self::ruc(1000 + $i);
            $row = ['company', "Empresa {$i} SAC", '', 'ruc', $ruc, 'PE', 'PEN', "c{$i}@x.pe", '', '', 'taxed', 'consolidated'];
            match ($invalid[$i] ?? null) {
                'ruc-malo' => $row[4] = substr($ruc, 0, 10).((((int) $ruc[10]) + 1) % 10),
                'sin-nombre' => $row[1] = '',
                'pais' => $row[5] = 'PERU',
                'moneda' => $row[6] = 'EUR',
                'repetido' => $row[4] = self::ruc(1001),
                default => null,
            };
            $lines[] = implode(',', $row);
        }
        $result = $this->postJson('/api/v1/admin/customers/imports', ['csv' => implode("\n", $lines), 'origin_brand_id' => $this->brand])->assertOk()->json('data');

        $this->assertSame(400, $result['total']);
        $this->assertSame(395, $result['imported']);
        $this->assertSame(5, $result['failed']);
        $this->assertSame(395, DB::table('customers')->count());
        $report = array_values(array_filter(explode("\n", $result['error_report_csv'])));
        $this->assertSame('fila,campo,error', $report[0]);
        $this->assertCount(5, array_unique(array_map(fn ($l) => explode(',', $l)[0], array_slice($report, 1))));
    }

    public function test_privacy_erasure_keeps_invoices_and_anonymizes_contact(): void
    {
        Queue::fake();
        ['customer' => $customer, 'contact' => $contact, 'user' => $user] = $this->portalCustomer();
        $org = DB::table('organizations')->value('id');
        $invoice = (string) Str::uuid();
        DB::table('invoices')->insert(['id' => $invoice, 'organization_id' => $org, 'legal_entity_id' => $this->entity, 'brand_id' => $this->brand, 'customer_id' => $customer['id'], 'type' => 'invoice', 'currency' => 'PEN']);

        $this->postJson("/api/v1/admin/customers/{$customer['id']}/personal-data-exports")->assertStatus(202);
        Queue::assertPushedOn('default', ExportPersonalData::class);

        $this->assertProblem($this->postJson("/api/v1/admin/customers/{$customer['id']}/personal-data-erasure", ['confirm_code' => 'X']), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/customers/{$customer['id']}/personal-data-erasure", ['confirm_code' => $customer['code']])->assertOk()->assertJsonPath('data.anonymized_contacts', 1);

        $this->assertTrue(DB::table('invoices')->where('id', $invoice)->where('customer_id', $customer['id'])->exists());
        $row = DB::table('contacts')->where('id', $contact)->first();
        $this->assertSame('Titular anonimizado', $row->name);
        $this->assertNull($row->email);
        $this->assertNotNull($row->deleted_at);
        $this->assertNotNull(DB::table('users')->where('id', $user->id)->value('deleted_at'));
    }
}
