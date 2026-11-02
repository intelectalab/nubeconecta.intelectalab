<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Tests\Feature\Identity\IdentityTestCase;

final class ServiceTypeTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $category;

    private string $brand;

    private string $serviceType;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Servicio SAC', 'tax_id' => '20000000002'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'serviciostest', 'name' => 'Servicios Test', 'portal_domain' => 'services.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->category = $this->postJson('/api/v1/admin/product-categories', ['code' => 'service-types', 'name' => 'Servicios', 'kind' => 'shared_hosting'])->assertCreated()->json('data.id');
        $this->serviceType = $this->postJson('/api/v1/admin/service-types', [
            'code' => 'managed-hosting', 'name' => ['es' => 'Hosting gestionado'], 'category_id' => $this->category,
        ])->assertCreated()->assertJsonPath('data.status', 'draft')->assertJsonPath('data.version', 1)->json('data.id');
    }

    public function test_it_updates_fields_and_runs_service_type_lifecycle(): void
    {
        $path = "/api/v1/admin/service-types/{$this->serviceType}";
        $this->patchJson($path, ['version' => 1, 'description' => ['es' => 'Descripción']])
            ->assertOk()->assertJsonPath('data.version', 2)->assertJsonPath('data.description.es', 'Descripción');
        $this->assertProblem($this->patchJson($path, ['version' => 1, 'icon' => 'server']), 409, 'version_conflict');

        $fieldsPath = $path.'/fields';
        $this->assertProblem($this->postJson($fieldsPath, ['key' => 'plan', 'label' => ['es' => 'Plan'], 'field_type' => 'select']), 422, 'validation_failed');
        $this->postJson($fieldsPath, ['key' => 'plan', 'label' => ['es' => 'Plan'], 'field_type' => 'select', 'options' => [['value' => 'basic', 'label' => ['es' => 'Básico']]]])
            ->assertCreated()->assertJsonPath('data.field_type', 'select')->assertJsonCount(1, 'data.options');
        $this->postJson($fieldsPath, ['key' => 'hostname', 'label' => ['es' => 'Nombre de host'], 'field_type' => 'text'])
            ->assertCreated()->assertJsonPath('data.options', []);

        $this->assertProblem($this->postJson($path.'/activate', ['version' => 2]), 422, 'validation_failed');
        $this->patchJson($path, ['version' => 2, 'brand_ids' => [$this->brand]])->assertOk()->assertJsonPath('data.version', 3);
        $this->postJson($path.'/activate', ['version' => 3])->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.version', 4);
        $this->postJson($path.'/archive', ['version' => 4])->assertOk()->assertJsonPath('data.status', 'archived')->assertJsonPath('data.version', 5);
    }

    public function test_show_returns_404_for_unknown_service_type(): void
    {
        // El sistema opera hoy una sola organización (CurrentOrganization = primera fila,
        // docs/00 §19): el aislamiento multi-organización lo garantiza el scope global
        // compartido BelongsToOrganization. Aquí verificamos el camino findOrFail + scope.
        $this->getJson('/api/v1/admin/service-types/'.\Illuminate\Support\Str::uuid()->toString())->assertNotFound();
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
