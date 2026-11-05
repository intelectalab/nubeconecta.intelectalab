<?php

declare(strict_types=1);

namespace Tests\Feature\Support;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use App\Modules\Support\Models\Complaint;
use App\Modules\Support\Models\ComplaintResponse;
use App\Modules\Support\Models\Ticket;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class PortalComplaintTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private string $brand;

    protected function setUp(): void
    {
        parent::setUp();
        $admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad Reclamos SAC', 'tax_id' => '20000000091'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'portal-complaint-test', 'name' => 'Portal Complaint Test', 'portal_domain' => 'complaints.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
    }

    public function test_customer_can_create_complaint_with_account_data_and_server_fields(): void
    {
        $customer = $this->createCustomer('Cliente Reclamo A SAC', '20100070970', 'reclamo-a@cliente.test');
        $contact = $this->createPortalContact($customer['id'], 'Contacto Reclamo A', 'contact-a@cliente.test');
        $other = $this->createCustomer('Cliente Reclamo B SAC', '20000000028', 'reclamo-b@cliente.test');

        $this->actAs($contact['user']);
        $response = $this->postJson('/api/v1/portal/complaints', [
            'complaint_type' => 'claim', 'service_description' => 'Mi servicio contratado', 'detail' => 'El servicio dejó de funcionar.', 'consumer_request' => 'Solicito la restitución del servicio.',
            'customer_id' => $other['id'], 'brand_id' => (string) Str::uuid(), 'status' => 'closed', 'is_test' => true, 'response_days' => 1,
            'number' => 999, 'code' => 'FALSO-999', 'organization_id' => (string) Str::uuid(), 'test_reason' => 'No debe aceptarse', 'ip_hash' => str_repeat('a', 64),
        ])->assertCreated()->assertJsonPath('data.status', 'received')->assertJsonPath('data.response_days', 15);

        $complaint = Complaint::query()->findOrFail($response->json('data.id'));
        $this->assertSame($customer['id'], $complaint->customer_id);
        $this->assertFalse($complaint->is_test);
        $this->assertSame('Cliente Reclamo A SAC', $complaint->consumer_name);
        $this->assertSame('ruc', $complaint->consumer_document_type);
        $this->assertSame('20100070970', $complaint->consumer_document_number);
        $this->assertSame('Av. Principal 123', $complaint->consumer_address);
        $this->assertSame('reclamo-a@cliente.test', $complaint->consumer_email);
        $this->assertSame('+5115550101', $complaint->consumer_phone);
        $this->assertSame($this->brand, $complaint->brand_id);
        $this->assertSame('received', $complaint->status);
        $this->assertNotSame(999, $complaint->number);
        $this->assertNotSame('FALSO-999', $complaint->code);
        $this->assertGreaterThan($complaint->received_at->getTimestamp(), $complaint->due_at->getTimestamp());
        $ticket = Ticket::query()->findOrFail($complaint->ticket_id);
        $this->assertSame($customer['id'], $ticket->customer_id);
        $this->assertSame('complaint', $ticket->type);
        $this->assertArrayNotHasKey('is_test', $response->json('data'));
        $this->assertArrayNotHasKey('ticket_id', $response->json('data'));
    }

    public function test_list_and_show_are_scoped_and_resource_hides_internal_fields(): void
    {
        $customerA = $this->createCustomer('Cliente Reclamo C SAC', '20100070988', 'reclamo-c@cliente.test');
        $contactA = $this->createPortalContact($customerA['id'], 'Contacto Reclamo C', 'contact-c@cliente.test');
        $customerB = $this->createCustomer('Cliente Reclamo D SAC', '20000000036', 'reclamo-d@cliente.test');
        $contactB = $this->createPortalContact($customerB['id'], 'Contacto Reclamo D', 'contact-d@cliente.test');

        $this->actAs($contactA['user']);
        $own = $this->postJson('/api/v1/portal/complaints', $this->complaintInput())->assertCreated()->json('data.id');
        $this->actAs($contactB['user']);
        $foreign = $this->postJson('/api/v1/portal/complaints', $this->complaintInput())->assertCreated()->json('data.id');
        $this->actAs($contactA['user']);

        $list = $this->getJson('/api/v1/portal/complaints?customer_id='.$customerB['id'])->assertOk();
        $this->assertSame([$own], array_column($list->json('data'), 'id'));
        $this->assertSame(404, $this->getJson('/api/v1/portal/complaints/'.$foreign)->getStatusCode());

        $staff = $this->makeUser(['admin'], mfa: true);
        $this->actAs($staff);
        $complaint = Complaint::query()->findOrFail($own);
        $body = 'Hemos revisado y atendido su solicitud.';
        $html = '<p>'.$body.'</p>';
        ComplaintResponse::query()->create([
            'complaint_id' => $complaint->id, 'body' => $body, 'body_html' => $html, 'previewed_at' => now()->subMinute(),
            'preview_sha256' => hash('sha256', $html), 'responded_by' => $staff->id, 'sent_to_email' => $complaint->consumer_email,
            'sent_at' => now(), 'is_final' => true,
        ]);
        $complaint->forceFill(['status' => 'answered', 'answered_at' => now()])->save();

        $this->actAs($contactA['user']);
        $show = $this->getJson('/api/v1/portal/complaints/'.$own)->assertOk();
        $this->assertSame([$body], array_column($show->json('data.responses'), 'body'));
        $this->assertArrayNotHasKey('responded_by', $show->json('data.responses.0'));
        $this->assertArrayNotHasKey('preview_sha256', $show->json('data.responses.0'));
        $this->assertArrayNotHasKey('sent_to_email', $show->json('data.responses.0'));
        foreach (['is_test', 'test_reason', 'test_marked_at', 'ip_hash', 'sheet_token_hash', 'acknowledgement_file_id', 'acknowledgement_sent_at', 'wp_site_id', 'ticket_id', 'version'] as $hidden) {
            $this->assertArrayNotHasKey($hidden, $show->json('data'));
        }
        $this->assertSame(405, $this->patchJson('/api/v1/portal/complaints/'.$own, ['detail' => 'Cambiar'])->getStatusCode());
        $this->assertSame(405, $this->deleteJson('/api/v1/portal/complaints/'.$own)->getStatusCode());
    }

    /** @return array<string, mixed> */
    private function createCustomer(string $name, string $taxId, string $email): array
    {
        return $this->postJson('/api/v1/admin/customers', [
            'type' => 'company', 'legal_name' => $name, 'tax_id_type' => 'ruc', 'tax_id' => $taxId,
            'country' => 'PE', 'currency' => 'PEN', 'address' => 'Av. Principal 123', 'email' => $email, 'phone' => '+5115550101', 'origin_brand_id' => $this->brand,
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

    /** @return array<string, mixed> */
    private function complaintInput(): array
    {
        return ['complaint_type' => 'grievance', 'service_description' => 'Servicio contratado', 'detail' => 'Detalle del reclamo.', 'consumer_request' => 'Solicito una respuesta.'];
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }
}
