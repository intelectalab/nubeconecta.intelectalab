<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class KbTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad KB SAC', 'tax_id' => '20000000091'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'kb-test', 'name' => 'KB Test', 'portal_domain' => 'kb.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_admin_can_manage_categories_and_articles_with_versioning(): void
    {
        $category = $this->postJson('/api/v1/admin/kb-categories', ['name' => 'Primeros pasos', 'slug' => 'primeros-pasos', 'visibility' => 'public'])
            ->assertCreated()->assertJsonPath('data.version', 1)->json('data.id');

        // slug duplicado → 422
        $this->postJson('/api/v1/admin/kb-categories', ['name' => 'Otra', 'slug' => 'primeros-pasos'])->assertStatus(422);

        $article = $this->postJson('/api/v1/admin/kb-articles', [
            'kb_category_id' => $category, 'brand_id' => $this->brand, 'title' => 'Cómo acceder al portal',
            'slug' => 'como-acceder', 'body' => 'Entra con tu correo y contraseña.', 'visibility' => 'public', 'status' => 'draft',
        ])->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.published_at', null)->json('data');

        // Publicar fija published_at.
        $published = $this->patchJson("/api/v1/admin/kb-articles/{$article['id']}", ['version' => 1, 'status' => 'published'])
            ->assertOk()->assertJsonPath('data.status', 'published');
        $this->assertNotNull($published->json('data.published_at'));

        // Versión obsoleta → 409.
        $this->patchJson("/api/v1/admin/kb-articles/{$article['id']}", ['version' => 1, 'title' => 'X'])
            ->assertStatus(409)->assertJsonPath('code', 'version_conflict');

        // Listado + búsqueda.
        $this->getJson('/api/v1/admin/kb-articles?filter.status=published')->assertOk()->assertJsonPath('data.0.id', $article['id']);
        $this->getJson('/api/v1/admin/kb-articles?q=acceder')->assertOk()->assertJsonPath('data.0.id', $article['id']);
        $this->getJson('/api/v1/admin/kb-articles?q=inexistente-xyz')->assertOk()->assertJsonCount(0, 'data');
        // Se puede ordenar por fecha de última edición (whitelist de orden del admin).
        $this->getJson('/api/v1/admin/kb-articles?sort=-updated_at')->assertOk();

        // Borrado (soft).
        $this->deleteJson("/api/v1/admin/kb-articles/{$article['id']}", ['version' => 2])->assertNoContent();
        $this->getJson("/api/v1/admin/kb-articles/{$article['id']}")->assertNotFound();
    }

    public function test_portal_only_sees_public_published_articles_of_its_brand(): void
    {
        $otherBrandEntity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Otra Entidad SAC', 'tax_id' => '20000000104'])->assertCreated()->json('data.id');
        $otherBrand = $this->postJson('/api/v1/admin/brands', ['code' => 'kb-otra', 'name' => 'KB Otra', 'portal_domain' => 'kbotra.test', 'default_legal_entity_id' => $otherBrandEntity])->assertCreated()->json('data.id');

        $make = fn (array $over) => $this->postJson('/api/v1/admin/kb-articles', array_merge([
            'title' => 'T', 'body' => 'Contenido de ayuda.', 'visibility' => 'public', 'status' => 'published',
        ], $over))->assertCreated()->json('data.id');

        $visibleBrand = $make(['title' => 'Cómo acceder', 'slug' => 'acceso-marca', 'brand_id' => $this->brand]);
        $visibleCommon = $make(['title' => 'Preguntas frecuentes', 'slug' => 'faq-general']);
        $make(['title' => 'Otra marca', 'slug' => 'otra-marca', 'brand_id' => $otherBrand]);
        $internal = $make(['title' => 'Guía interna', 'slug' => 'interna', 'visibility' => 'internal']);
        $make(['title' => 'Borrador', 'slug' => 'borrador', 'status' => 'draft']);

        $customer = $this->createCustomer('Cliente KB SAC', '20100070970');
        $contact = $this->createPortalContact($customer['id'], 'Contacto KB', 'kb@cliente.test');
        $this->actAs($contact['user']);

        $list = $this->getJson('/api/v1/portal/kb-articles')->assertOk();
        $ids = array_column($list->json('data'), 'id');
        sort($ids);
        $expected = [$visibleBrand, $visibleCommon];
        sort($expected);
        $this->assertSame($expected, $ids);
        // El listado no expone el cuerpo ni campos internos.
        $this->assertStringNotContainsString('visibility', json_encode($list->json('data')));

        // El detalle sí entrega el cuerpo; los no públicos dan 404.
        $this->getJson("/api/v1/portal/kb-articles/{$visibleBrand}")->assertOk()->assertJsonPath('data.body', 'Contenido de ayuda.');
        $this->getJson("/api/v1/portal/kb-articles/{$internal}")->assertNotFound();

        // Búsqueda.
        $this->getJson('/api/v1/portal/kb-articles?q=acceder')->assertOk()->assertJsonPath('data.0.id', $visibleBrand);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function createCustomer(string $name, string $taxId): array
    {
        return $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data');
    }

    private function createPortalContact(string $customerId, string $name, string $email): array
    {
        $id = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", [
            'name' => $name, 'email' => $email, 'roles' => ['administrative'], 'portal_role' => 'customer_admin',
        ])->assertCreated()->json('data.id');

        return ['id' => $id, 'user' => User::query()->findOrFail(Contact::query()->findOrFail($id)->user_id)];
    }
}
