<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use App\Modules\Support\Models\Ticket;
use App\Modules\Support\Models\TicketMessage;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class PortalTicketTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Tickets SAC', 'tax_id' => '20000000091'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'portal-ticket-test', 'name' => 'Portal Ticket Test', 'portal_domain' => 'tickets.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_customer_can_create_ticket_and_cannot_inject_server_fields(): void
    {
        $customer = $this->createCustomer('Cliente Ticket A SAC', '20100070970');
        $contact = $this->createPortalContact($customer['id'], 'Contacto Ticket A', 'ticket-a@cliente.test');
        $other = $this->createCustomer('Cliente Ticket B SAC', '20000000028');

        $this->actAs($contact['user']);
        $response = $this->postJson('/api/v1/portal/tickets', [
            'subject' => 'No puedo acceder', 'body' => 'Necesito ayuda.', 'type' => 'incident',
            'customer_id' => $other['id'], 'contact_id' => (string) Str::uuid(), 'status' => 'closed',
            'assignee_id' => (string) Str::uuid(), 'is_internal' => true, 'channel' => 'internal', 'number' => 'TIC-999999',
        ])->assertCreated()->assertJsonPath('data.status', 'new')->assertJsonPath('data.type', 'incident');

        $ticket = Ticket::query()->findOrFail($response->json('data.id'));
        $this->assertSame($customer['id'], $ticket->customer_id);
        $this->assertSame($contact['id'], $ticket->contact_id);
        $this->assertSame('portal', $ticket->channel);
        $this->assertSame('new', $ticket->status);
        $this->assertNotSame('TIC-999999', $ticket->number);
        $message = $ticket->messages()->firstOrFail();
        $this->assertSame($contact['id'], $message->author_contact_id);
        $this->assertSame('customer', $message->author_type);
        $this->assertFalse($message->is_internal);
        $this->assertSame('portal', $message->channel);
    }

    public function test_list_show_and_reply_are_scoped_and_internal_notes_are_hidden(): void
    {
        $customerA = $this->createCustomer('Cliente Ticket C SAC', '20100070988');
        $contactA = $this->createPortalContact($customerA['id'], 'Contacto Ticket C', 'ticket-c@cliente.test');
        $customerB = $this->createCustomer('Cliente Ticket D SAC', '20000000036');
        $foreignTicket = $this->makeTicket($customerB['id'], null, 'Ticket privado de otro cliente');
        $ownTicket = $this->makeTicket($customerA['id'], $contactA['id'], 'Ticket propio');
        TicketMessage::query()->create(['ticket_id' => $ownTicket->id, 'author_type' => 'staff', 'channel' => 'internal', 'body' => 'Nota interna confidencial', 'is_internal' => true]);
        TicketMessage::query()->create(['ticket_id' => $ownTicket->id, 'author_type' => 'staff', 'channel' => 'email', 'body' => 'Respuesta visible de soporte', 'is_internal' => false]);

        $this->actAs($contactA['user']);
        $list = $this->getJson('/api/v1/portal/tickets?customer_id='.$customerB['id'])->assertOk();
        $this->assertSame([$ownTicket->id], array_column($list->json('data'), 'id'));
        $this->assertStringNotContainsString('assignee_id', json_encode($list->json('data')));
        $this->assertStringNotContainsString('sla_', json_encode($list->json('data')));

        $show = $this->getJson('/api/v1/portal/tickets/'.$ownTicket->id)->assertOk();
        $this->assertStringNotContainsString('Nota interna confidencial', json_encode($show->json()));
        $this->assertSame(['Respuesta visible de soporte'], array_column($show->json('data.messages'), 'body'));
        $this->assertSame('Soporte', $show->json('data.messages.0.author'));
        $this->assertArrayNotHasKey('is_internal', $show->json('data.messages.0'));
        $this->assertArrayNotHasKey('assignee_id', $show->json('data'));
        $this->assertArrayNotHasKey('contact_id', $show->json('data'));
        $this->assertArrayNotHasKey('customer_id', $show->json('data'));
        $this->assertSame(404, $this->getJson('/api/v1/portal/tickets/'.$foreignTicket->id)->getStatusCode());

        $reply = $this->postJson('/api/v1/portal/tickets/'.$ownTicket->id.'/messages', [
            'body' => 'Sigo necesitando ayuda.', 'author_type' => 'staff', 'is_internal' => true, 'channel' => 'internal',
        ])->assertCreated();
        $this->assertSame('Tú', $reply->json('data.author'));
        $this->assertArrayNotHasKey('is_internal', $reply->json('data'));
        $created = TicketMessage::query()->findOrFail($reply->json('data.id'));
        $this->assertSame('customer', $created->author_type);
        $this->assertSame($contactA['id'], $created->author_contact_id);
        $this->assertFalse($created->is_internal);
        $this->assertSame('portal', $created->channel);
        $this->assertSame(404, $this->postJson('/api/v1/portal/tickets/'.$foreignTicket->id.'/messages', ['body' => 'No autorizado'])->getStatusCode());
    }

    public function test_ticket_show_exposes_only_customer_attachments(): void
    {
        Storage::fake('local');
        config(['hub.files.disk' => 'local', 'hub.files.max_bytes' => 10 * 1024 * 1024]);

        $customer = $this->createCustomer('Cliente Ticket E SAC', '20100070970');
        $contact = $this->createPortalContact($customer['id'], 'Contacto Ticket E', 'ticket-e@cliente.test');

        $this->actAs($contact['user']);
        $ticket = $this->postJson('/api/v1/portal/tickets', ['subject' => 'Con adjunto'])->assertCreated()->json('data.id');

        // El cliente sube su adjunto (el backend fuerza visibility=customer).
        $customerFile = $this->post('/api/v1/portal/files', [
            'file' => UploadedFile::fake()->image('captura.png'),
            'attachable_type' => 'ticket', 'attachable_id' => $ticket,
        ])->assertCreated()->json('data.id');

        // El staff adjunta un archivo interno al mismo ticket.
        $this->actAs($this->admin);
        $this->post('/api/v1/admin/files', [
            'file' => UploadedFile::fake()->create('interno.pdf', 50, 'application/pdf'),
            'attachable_type' => 'ticket', 'attachable_id' => $ticket, 'visibility' => 'internal',
        ])->assertCreated();

        // El cliente ve solo su adjunto, sin campos internos ni el archivo interno.
        $this->actAs($contact['user']);
        $show = $this->getJson('/api/v1/portal/tickets/'.$ticket)->assertOk();
        $this->assertSame([$customerFile], array_column($show->json('data.attachments'), 'id'));
        $this->assertStringNotContainsString('interno.pdf', json_encode($show->json()));
        $this->assertArrayNotHasKey('visibility', $show->json('data.attachments.0'));
        $this->assertArrayNotHasKey('scan_status', $show->json('data.attachments.0'));
        $this->assertArrayNotHasKey('path', $show->json('data.attachments.0'));
    }

    /** @return array<string, mixed> */
    private function createCustomer(string $name, string $taxId): array
    {
        return $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand,
        ])->assertCreated()->json('data');
    }

    /** @return array{id: string, user: User} */
    private function createPortalContact(string $customerId, string $name, string $email): array
    {
        $id = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", [
            'name' => $name, 'email' => $email, 'roles' => ['administrative'], 'portal_role' => 'customer_admin',
        ])->assertCreated()->json('data.id');

        return ['id' => $id, 'user' => User::query()->findOrFail(Contact::query()->findOrFail($id)->user_id)];
    }

    private function makeTicket(string $customerId, ?string $contactId, string $subject): Ticket
    {
        return Ticket::query()->create(['number' => 'TIC-'.Str::upper(Str::random(8)), 'customer_id' => $customerId, 'contact_id' => $contactId, 'channel' => 'portal', 'status' => 'new', 'priority' => 'medium', 'subject' => $subject]);
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
