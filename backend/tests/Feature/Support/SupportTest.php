<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class SupportTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;
    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Soporte SAC', 'tax_id' => '20000000091'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'soportetest', 'name' => 'Soporte Test', 'portal_domain' => 'support.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_ticket_message_and_status_flow(): void
    {
        $ticket = $this->postJson('/api/v1/admin/tickets', ['brand_id' => $this->brand, 'channel' => 'portal', 'subject' => 'No puedo acceder'])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/tickets/{$ticket}/messages", ['channel' => 'internal', 'body' => 'Revisar el acceso', 'is_internal' => true])->assertCreated()->assertJsonPath('data.is_internal', true);
        $this->patchJson("/api/v1/admin/tickets/{$ticket}", ['version' => 2, 'status' => 'open'])->assertOk()->assertJsonPath('data.status', 'open');
        $this->getJson('/api/v1/admin/tickets/'.Str::uuid())->assertNotFound();
    }

    public function test_complaint_and_official_response(): void
    {
        $complaint = $this->postJson('/api/v1/admin/complaints', [
            'brand_id' => $this->brand, 'complaint_type' => 'claim', 'consumer_name' => 'Consumidor Prueba', 'consumer_document_type' => 'dni', 'consumer_document_number' => '12345678',
            'consumer_address' => 'Lima', 'consumer_email' => 'consumidor@example.test', 'service_description' => 'Servicio contratado', 'detail' => 'El servicio no estuvo disponible.', 'consumer_request' => 'Solicito solución.', 'response_days' => 15,
        ])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/complaints/{$complaint}/responses", ['body' => 'Atenderemos el caso.', 'body_html' => '<p>Atenderemos el caso.</p>', 'previewed_at' => now()->subMinute()->toISOString()])->assertCreated();
        $this->getJson('/api/v1/admin/complaints/'.Str::uuid())->assertNotFound();
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
