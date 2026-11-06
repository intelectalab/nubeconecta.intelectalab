<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Models\NotificationDelivery;
use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Support\Models\Ticket;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class NotifyEventsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;
    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        Mail::fake();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Notificaciones SAC', 'tax_id' => '20000000091'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'notify-events-test', 'name' => 'Notify Events Test', 'portal_domain' => 'notify.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        // Las plantillas ticket.customer_reply y complaint.received las siembra NotificationsSeeder en la organización base.
    }

    public function test_public_staff_reply_queues_email_and_is_deduplicated_by_message(): void
    {
        $customer = $this->createCustomer('Cliente Notificaciones SAC', '20100070970');
        $contact = $this->createContact($customer['id'], 'Contacto Notificaciones', 'notify-contact@cliente.test');
        $ticket = $this->makeTicket($customer['id'], $contact['id']);

        $response = $this->postJson('/api/v1/admin/tickets/'.$ticket->id.'/messages', [
            'body' => 'Su solicitud fue atendida.', 'is_internal' => false, 'channel' => 'email',
        ])->assertCreated();
        $messageId = $response->json('data.id');

        $delivery = NotificationDelivery::query()->where('event', 'ticket.customer_reply')->where('entity_id', $ticket->id)->firstOrFail();
        $this->assertSame('notify-contact@cliente.test', $delivery->recipient_address);
        $this->assertSame('ticket_message:'.$messageId, $delivery->dedupe_key);
        Mail::assertQueued(NotificationMail::class, fn (NotificationMail $mail): bool => $mail->deliveryId === $delivery->id);

        app(NotificationService::class)->send([
            'event' => 'ticket.customer_reply', 'template_code' => 'ticket.customer_reply',
            'recipient_address' => $contact['email'], 'customer_id' => $customer['id'], 'recipient_contact_id' => $contact['id'],
            'brand_id' => $this->brand, 'entity_type' => 'ticket', 'entity_id' => $ticket->id,
            'dedupe_key' => 'ticket_message:'.$messageId,
            'variables' => ['numero' => $ticket->number, 'cliente' => 'Contacto Notificaciones', 'mensaje' => 'Su solicitud fue atendida.', 'asunto' => $ticket->subject],
        ]);
        $this->assertSame(1, NotificationDelivery::query()->where('dedupe_key', 'ticket_message:'.$messageId)->count());
        Mail::assertQueued(NotificationMail::class, 1);
    }

    public function test_internal_staff_note_does_not_queue_email(): void
    {
        $customer = $this->createCustomer('Cliente Nota Interna SAC', '20100070988');
        $contact = $this->createContact($customer['id'], 'Contacto Nota Interna', 'internal-note@cliente.test');
        $ticket = $this->makeTicket($customer['id'], $contact['id']);

        $this->postJson('/api/v1/admin/tickets/'.$ticket->id.'/messages', [
            'body' => 'Nota interna de seguimiento.', 'is_internal' => true, 'channel' => 'internal',
        ])->assertCreated();

        Mail::assertNotQueued(NotificationMail::class);
        $this->assertSame(0, NotificationDelivery::query()->where('event', 'ticket.customer_reply')->count());
    }

    public function test_admin_complaint_creation_queues_confirmation_to_consumer_email(): void
    {
        $email = 'consumer-complaint@cliente.test';
        $response = $this->postJson('/api/v1/admin/complaints', [
            'brand_id' => $this->brand,
            'complaint_type' => 'claim',
            'consumer_name' => 'Consumidor de Prueba',
            'consumer_document_type' => 'dni',
            'consumer_document_number' => '12345678',
            'consumer_address' => 'Av. Central 123',
            'consumer_email' => $email,
            'service_description' => 'Servicio contratado',
            'detail' => 'Detalle del reclamo.',
            'consumer_request' => 'Solicito una respuesta.',
            'response_days' => 15,
        ])->assertCreated();

        $complaintId = $response->json('data.id');
        $delivery = NotificationDelivery::query()->where('event', 'complaint.received')->where('entity_id', $complaintId)->firstOrFail();
        $this->assertSame($email, $delivery->recipient_address);
        Mail::assertQueued(NotificationMail::class, fn (NotificationMail $mail): bool => $mail->deliveryId === $delivery->id);
    }

    /** @return array<string, mixed> */
    private function createCustomer(string $name, string $taxId): array
    {
        return $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data');
    }

    /** @return array{id: string, email: string} */
    private function createContact(string $customerId, string $name, string $email): array
    {
        $id = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", [
            'name' => $name, 'email' => $email, 'roles' => ['administrative'],
        ])->assertCreated()->json('data.id');
        Contact::query()->whereKey($id)->update(['is_primary' => true]);

        return ['id' => $id, 'email' => $email];
    }

    private function makeTicket(string $customerId, string $contactId): Ticket
    {
        return Ticket::query()->create([
            'number' => 'TIC-'.Str::upper(Str::random(8)), 'customer_id' => $customerId, 'contact_id' => $contactId,
            'brand_id' => $this->brand, 'channel' => 'portal', 'status' => 'new', 'priority' => 'medium', 'subject' => 'Consulta de prueba',
        ]);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
