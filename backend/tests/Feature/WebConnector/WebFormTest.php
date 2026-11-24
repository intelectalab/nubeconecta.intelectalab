<?php

declare(strict_types=1);

namespace Tests\Feature\WebConnector;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Identity\IdentityTestCase;

/** Definición de formularios embebibles (web_connector.form.*) y sus campos. */
final class WebFormTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private const BASE = '/api/v1/admin/web-connector/forms';

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    private function brand(): string
    {
        $entity = DB::table('legal_entities')->value('id') ?? $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');

        return $this->postJson('/api/v1/admin/brands', ['code' => 'marca-wf', 'name' => 'MARCA-WF', 'portal_domain' => 'portal.marca-wf.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_web_form_crud_with_fields_and_business_rules(): void
    {
        $brand = $this->brand();

        $create = $this->postJson(self::BASE, [
            'brand_id' => $brand, 'code' => 'contacto', 'name' => 'Contacto', 'destination' => 'email', 'notify_email' => 'web@marca.test',
            'consent_required' => true, 'consent_purpose' => 'privacy', 'consent_text' => ['es' => 'Acepto la política.'],
            'status' => 'active', 'success_message' => ['es' => '¡Gracias! Te responderemos pronto.'],
            'fields' => [
                ['key' => 'nombre', 'label' => ['es' => 'Nombre'], 'field_type' => 'text', 'is_required' => true, 'maps_to' => 'name'],
                ['key' => 'correo', 'label' => ['es' => 'Correo'], 'field_type' => 'email', 'is_required' => true, 'maps_to' => 'email'],
            ],
        ])->assertCreated()->assertJsonCount(2, 'data.fields')->assertJsonPath('data.fields.0.key', 'nombre');
        $id = $create->json('data.id');

        $this->getJson(self::BASE."?filter[brand_id]={$brand}")->assertOk()->assertJsonPath('data.0.fields_count', 2);

        // Reemplaza los campos (3, con una lista): el constructor los sincroniza.
        $this->patchJson(self::BASE."/{$id}", ['version' => $create->json('data.version'), 'fields' => [
            ['key' => 'nombre', 'label' => ['es' => 'Nombre'], 'field_type' => 'text', 'is_required' => true],
            ['key' => 'asunto', 'label' => ['es' => 'Asunto'], 'field_type' => 'select', 'options' => [['value' => 'ventas', 'label' => ['es' => 'Ventas']]], 'maps_to' => 'subject'],
            ['key' => 'mensaje', 'label' => ['es' => 'Mensaje'], 'field_type' => 'textarea', 'is_required' => true, 'maps_to' => 'message'],
        ]])->assertOk()->assertJsonCount(3, 'data.fields')->assertJsonPath('data.fields.1.key', 'asunto');

        // Regla: lista/casillas sin opciones → 422.
        $this->assertProblem($this->postJson(self::BASE, [
            'brand_id' => $brand, 'code' => 'otro', 'name' => 'Otro', 'destination' => 'lead', 'consent_required' => false, 'status' => 'draft',
            'fields' => [['key' => 'plan', 'label' => ['es' => 'Plan'], 'field_type' => 'select', 'options' => []]],
        ]), 422, 'validation_failed');

        // Regla: activo exige mensaje de confirmación.
        $this->assertProblem($this->postJson(self::BASE, [
            'brand_id' => $brand, 'code' => 'activo', 'name' => 'Activo', 'destination' => 'lead', 'consent_required' => false, 'status' => 'active',
            'fields' => [['key' => 'nombre', 'label' => ['es' => 'Nombre'], 'field_type' => 'text']],
        ]), 422, 'validation_failed');

        $this->deleteJson(self::BASE."/{$id}")->assertNoContent();
        $this->assertCount(0, $this->getJson(self::BASE."?filter[brand_id]={$brand}")->json('data'));
        $this->assertNull(app(\App\Shared\Audit\AuditLogger::class)->verify());
    }
}
