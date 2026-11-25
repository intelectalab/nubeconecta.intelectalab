<?php

declare(strict_types=1);

namespace Tests\Feature\Portal;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/**
 * Portal del cliente: Dominios y Contratos (solo lectura), aislados por cliente.
 */
final class PortalDomainsContractsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    private string $orgId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->orgId = $this->admin->organization_id;
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Portal SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', [
            'code' => 'marca-portal', 'name' => 'Marca Portal', 'portal_domain' => 'portal.marca.test', 'default_legal_entity_id' => $entity,
        ])->assertCreated()->json('data.id');
    }

    public function test_portal_domains_and_contracts_are_scoped_to_the_session_customer(): void
    {
        $a = $this->createCustomerWithPortalUser('Cliente A SAC', '20100070970', 'a@cliente.test');
        $b = $this->createCustomerWithPortalUser('Cliente B SAC', '20000000028', 'b@cliente.test');

        $domA = $this->seedDomain($a['id'], 'clientea-dom.com');
        $domB = $this->seedDomain($b['id'], 'clienteb-dom.com');
        $conA = $this->seedContract($a['id'], 'CTR-A-001');
        $conB = $this->seedContract($b['id'], 'CTR-B-001');

        $this->actAs($a['user']);

        // Dominios: solo los de A; el de B es 404.
        $domains = $this->getJson('/api/v1/portal/domains')->assertOk();
        $this->assertSame([$domA], array_column($domains->json('data'), 'id'));
        $this->assertStringNotContainsString('clienteb-dom.com', json_encode($domains->json()));
        // El recurso del portal no filtra datos internos (registrador/cuenta de proveedor).
        $this->assertStringNotContainsString('provider_account_id', json_encode($domains->json()));
        $this->assertProblem($this->getJson("/api/v1/portal/domains/{$domB}"), 404, 'not_found');
        $this->getJson("/api/v1/portal/domains/{$domA}")->assertOk()->assertJsonPath('data.name', 'clientea-dom.com');

        // Contratos: solo los de A; el de B es 404.
        $contracts = $this->getJson('/api/v1/portal/contracts')->assertOk();
        $this->assertSame([$conA], array_column($contracts->json('data'), 'id'));
        $this->assertProblem($this->getJson("/api/v1/portal/contracts/{$conB}"), 404, 'not_found');
        $this->getJson("/api/v1/portal/contracts/{$conA}")->assertOk()->assertJsonPath('data.status', 'signed_active');
    }

    public function test_portal_contracts_hide_internal_draft_states(): void
    {
        $a = $this->createCustomerWithPortalUser('Cliente C SAC', '20000000036', 'c@cliente.test');
        $draft = $this->seedContract($a['id'], 'CTR-C-DRAFT', 'draft');

        $this->actAs($a['user']);
        $this->getJson('/api/v1/portal/contracts')->assertOk()->assertJsonCount(0, 'data');
        $this->assertProblem($this->getJson("/api/v1/portal/contracts/{$draft}"), 404, 'not_found');
    }

    public function test_portal_contract_document_and_legal_acceptance(): void
    {
        $a = $this->createCustomerWithPortalUser('Cliente D SAC', '20000000044', 'd@cliente.test');
        $other = $this->createCustomerWithPortalUser('Cliente E SAC', '20000000052', 'e@cliente.test');
        $con = $this->seedContract($a['id'], 'CTR-D-001');
        $conOther = $this->seedContract($other['id'], 'CTR-E-001');
        $vid = $this->seedPublishedLegal($this->brand, 'Términos y Condiciones', 'terminos');

        $this->actAs($a['user']);

        // Documento (HTML imprimible) del contrato propio; el ajeno responde 404.
        $this->get("/api/v1/portal/contracts/{$con}/document")->assertOk()->assertSee('CTR-D-001');
        $this->assertProblem($this->get("/api/v1/portal/contracts/{$conOther}/document"), 404, 'not_found');

        // Documentos legales: aparece sin aceptar → aceptar → queda aceptado (constancia en legal_acceptances).
        $legal = $this->getJson('/api/v1/portal/legal-documents')->assertOk();
        $this->assertSame('Términos y Condiciones', $legal->json('data.0.title'));
        $this->assertFalse($legal->json('data.0.accepted'));
        $this->postJson('/api/v1/portal/legal-acceptances', ['version_id' => $vid])->assertOk()->assertJsonPath('data.accepted', true);
        $this->getJson('/api/v1/portal/legal-documents')->assertOk()->assertJsonPath('data.0.accepted', true);
        $this->assertDatabaseHas('legal_acceptances', ['legal_document_version_id' => $vid, 'user_id' => $a['user']->id, 'context' => 'portal']);

        // Una versión inexistente o no publicada de la marca → 422.
        $this->assertProblem($this->postJson('/api/v1/portal/legal-acceptances', ['version_id' => (string) Str::uuid()]), 422, 'validation_failed');
    }

    private function seedDomain(string $customerId, string $name): string
    {
        $id = (string) Str::uuid();
        DB::table('domains')->insert([
            'id' => $id, 'organization_id' => $this->orgId, 'name' => $name, 'tld' => 'com',
            'customer_id' => $customerId, 'holder' => 'customer', 'status' => 'active',
            'registry_expires_at' => now()->addMonths(6)->toDateString(),
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    private function seedContract(string $customerId, string $number, string $status = 'signed_active'): string
    {
        $id = (string) Str::uuid();
        $signed = $status === 'signed_active';
        DB::table('contracts')->insert([
            'id' => $id, 'organization_id' => $this->orgId, 'number' => $number, 'customer_id' => $customerId,
            'brand_id' => $this->brand, 'currency' => 'PEN', 'status' => $status,
            'starts_on' => now()->toDateString(), 'ends_on' => now()->addYear()->toDateString(),
            'approved_at' => $signed ? now() : null, 'signed_at' => $signed ? now() : null,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $id;
    }

    /** Siembra un documento legal con una versión publicada para la marca; devuelve el id de la versión. */
    private function seedPublishedLegal(string $brand, string $title, string $slug): string
    {
        $docId = (string) Str::uuid();
        $vid = (string) Str::uuid();
        DB::table('legal_documents')->insert([
            'id' => $docId, 'organization_id' => $this->orgId, 'brand_id' => $brand,
            'kind' => 'terms', 'locale' => 'es', 'title' => $title, 'slug' => $slug,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('legal_document_versions')->insert([
            'id' => $vid, 'organization_id' => $this->orgId, 'legal_document_id' => $docId,
            'version_number' => 1, 'version_label' => '2026-11', 'body' => '<p>Términos del servicio.</p>',
            'status' => 'published', 'effective_at' => now(), 'published_at' => now(), 'published_by' => $this->admin->id,
            'legal_reviewed_by' => 'Asesoría Legal', 'legal_reviewed_at' => now(),
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('legal_documents')->where('id', $docId)->update(['published_version_id' => $vid]);

        return $vid;
    }

    /** @return array{id: string, user: User} */
    private function createCustomerWithPortalUser(string $name, string $taxId, string $email): array
    {
        $customerId = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data.id');

        $contactId = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", [
            'name' => 'Contacto', 'email' => $email, 'roles' => ['administrative'], 'portal_role' => 'customer_admin',
        ])->assertCreated()->json('data.id');

        $user = User::query()->findOrFail(Contact::query()->findOrFail($contactId)->user_id);

        return ['id' => $customerId, 'user' => $user];
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
