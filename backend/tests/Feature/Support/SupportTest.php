<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\User;
use App\Modules\Settings\Models\BusinessHour;
use App\Modules\Settings\Models\Holiday;
use App\Shared\Organization\CurrentOrganization;
use Carbon\Carbon;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
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

    public function test_tickets_index_filters_by_customer(): void
    {
        $customer = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => 'Cliente Uno SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970',
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data.id');

        $mine = $this->postJson('/api/v1/admin/tickets', ['brand_id' => $this->brand, 'customer_id' => $customer, 'channel' => 'portal', 'subject' => 'Del cliente'])->assertCreated()->json('data.id');
        $this->postJson('/api/v1/admin/tickets', ['brand_id' => $this->brand, 'channel' => 'portal', 'subject' => 'Sin cliente'])->assertCreated();

        // El índice filtrado por cliente devuelve solo los tickets de ese cliente (lo usa la ficha).
        $res = $this->getJson("/api/v1/admin/tickets?customer_id={$customer}")->assertOk();
        $this->assertSame([$mine], array_column($res->json('data'), 'id'));

        // Un customer_id malformado no debe reventar la consulta (guard de uuid): se ignora el filtro.
        $this->getJson('/api/v1/admin/tickets?customer_id=no-es-uuid')->assertOk();
    }

    public function test_ticket_show_includes_uploaded_attachments(): void
    {
        Storage::fake('local');
        config(['hub.files.disk' => 'local']);
        $ticket = $this->postJson('/api/v1/admin/tickets', ['brand_id' => $this->brand, 'channel' => 'portal', 'subject' => 'Adjunto evidencia'])->assertCreated()->json('data.id');

        $fileId = $this->post('/api/v1/admin/files', [
            'file' => UploadedFile::fake()->image('captura.jpg'),
            'attachable_type' => 'ticket',
            'attachable_id' => $ticket,
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/v1/admin/tickets/{$ticket}")
            ->assertOk()
            ->assertJsonPath('data.attachments.0.id', $fileId)
            ->assertJsonPath('data.attachments.0.original_name', 'captura.jpg');
    }

    public function test_ticket_show_includes_assignee_and_customer_names(): void
    {
        $customer = $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => 'Cliente Soporte SAC', 'tax_id_type' => 'ruc', 'tax_id' => '20100070970',
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data.id');
        $ticket = $this->postJson('/api/v1/admin/tickets', [
            'brand_id' => $this->brand, 'customer_id' => $customer, 'assignee_id' => $this->admin->id, 'channel' => 'portal', 'subject' => 'Con nombres',
        ])->assertCreated()->json('data.id');

        $this->getJson("/api/v1/admin/tickets/{$ticket}")
            ->assertOk()
            ->assertJsonPath('data.assignee.id', $this->admin->id)
            ->assertJsonPath('data.assignee.name', $this->admin->name)
            ->assertJsonPath('data.customer.id', $customer)
            ->assertJsonPath('data.customer.name', 'Cliente Soporte SAC');
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

    public function test_test_complaint_can_be_created_and_deleted(): void
    {
        $complaint = $this->postJson('/api/v1/admin/complaints', [
            'brand_id' => $this->brand, 'complaint_type' => 'grievance', 'consumer_name' => 'QA Prueba', 'consumer_document_type' => 'dni', 'consumer_document_number' => '87654321',
            'consumer_address' => 'Lima', 'consumer_email' => 'qa@example.test', 'service_description' => 'Servicio', 'detail' => 'Detalle.', 'consumer_request' => 'Pedido.', 'response_days' => 10,
            'is_test' => true, 'test_reason' => 'Prueba automatizada.',
        ])->assertCreated()->assertJsonPath('data.is_test', true)->json('data.id');
        $this->deleteJson("/api/v1/admin/complaints/{$complaint}", ['version' => 1])->assertNoContent();
    }

    public function test_complaint_due_date_skips_weekends_and_holidays_when_calendar_configured(): void
    {
        app(CurrentOrganization::class)->set($this->admin->organization_id);
        foreach (range(1, 5) as $weekday) {
            BusinessHour::query()->create(['calendar' => 'default', 'timezone' => 'America/Lima', 'weekday' => $weekday, 'opens_at' => '09:00', 'closes_at' => '18:00']);
        }
        Holiday::query()->create(['country' => 'PE', 'date' => '2026-11-04', 'name' => 'Feriado de prueba', 'recurring' => false]);
        Carbon::setTestNow('2026-11-02 10:00:00'); // lunes; +5 habiles salta el feriado (mie 04) y el fin de semana -> mar 10
        try {
            $this->postJson('/api/v1/admin/complaints', [
                'brand_id' => $this->brand, 'complaint_type' => 'claim', 'consumer_name' => 'Plazo Habil', 'consumer_document_type' => 'dni', 'consumer_document_number' => '11112222',
                'consumer_address' => 'Lima', 'consumer_email' => 'plazo@example.test', 'service_description' => 'Servicio', 'detail' => 'Detalle.', 'consumer_request' => 'Pedido.', 'response_days' => 5,
            ])->assertCreated()->assertJsonPath('data.due_at', fn ($value) => is_string($value) && str_starts_with($value, '2026-11-10'));
        } finally {
            Carbon::setTestNow();
        }
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
