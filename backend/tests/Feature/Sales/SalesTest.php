<?php

declare(strict_types=1);

namespace Tests\Feature\Sales;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class SalesTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    private string $form;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'MARCA-A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->form = (string) Str::uuid();
        DB::table('web_forms')->insert(['id' => $this->form, 'organization_id' => $this->admin->organization_id, 'brand_id' => $this->brand, 'code' => 'cotizacion', 'name' => 'Cotización', 'status' => 'active', 'destination' => 'email',
            'notify_email' => 'ventas@marca.test', 'consent_required' => true, 'consent_purpose' => 'marketing', 'consent_text' => json_encode(['es' => 'Acepto']),
            'captcha_required' => false, 'success_message' => json_encode(['es' => 'Gracias'])]);
    }

    private function submission(array $payload = [], bool $consent = true): string
    {
        $id = (string) Str::uuid();
        DB::table('web_form_submissions')->insert([
            'id' => $id, 'organization_id' => $this->admin->organization_id, 'web_form_id' => $this->form, 'brand_id' => $this->brand, 'idempotency_key' => (string) Str::uuid(),
            'payload' => json_encode($payload + ['name' => 'Ana Pérez', 'email' => 'ana@cliente.pe', 'phone' => '+51999888777', 'company' => 'ACME SAC', 'message' => 'Quiero cotizar hosting.']),
            'consent_given' => $consent, 'page_url' => 'https://www.marca-a.test/planes/', 'attribution' => json_encode(['source' => 'google', 'campaign' => 'hosting']), 'status' => 'received',
        ]);

        return $id;
    }

    private function stage(string $code): string
    {
        return (string) DB::table('pipeline_stages')->where('code', $code)->value('id');
    }

    public function test_seeds_are_idempotent_and_follow_the_documented_default_funnel(): void
    {
        $this->artisan('db:seed', ['--class' => \App\Modules\Sales\Database\Seeders\SalesSeeder::class])->assertSuccessful();
        $this->assertSame(['Nuevo', 'Contactado', 'Propuesta enviada', 'Negociación', 'Ganado', 'Perdido'], DB::table('pipeline_stages')->orderBy('sort_order')->pluck('name')->all());
        $this->assertSame(['won', 'lost'], DB::table('pipeline_stages')->where('outcome', '<>', 'open')->orderBy('sort_order')->pluck('outcome')->all());
        $this->assertSame(1, DB::table('lead_channels')->where('code', 'web')->where('kind', 'web_form')->count());
    }

    public function test_web_submission_to_lead_to_won_customer_flow_with_audit_and_idempotency(): void
    {
        $sub = $this->submission();

        // Solicitud -> prospecto (canal web, atribución, mensaje como nota, solicitud derivada).
        $res = $this->postJson("/api/v1/admin/web-connector/form-submissions/{$sub}/lead")->assertCreated()->assertJsonPath('data.created', true);
        $leadId = $res->json('data.lead_id');
        $this->assertMatchesRegularExpression('/^PRO-\d{6}$/', $res->json('data.code'));
        $row = DB::table('web_form_submissions')->where('id', $sub)->first();
        $this->assertSame(['routed', $leadId], [$row->status, $row->lead_id]);
        $this->assertNotNull($row->routed_at);
        // Idempotente: no duplica.
        $this->postJson("/api/v1/admin/web-connector/form-submissions/{$sub}/lead")->assertOk()->assertJsonPath('data.created', false)->assertJsonPath('data.lead_id', $leadId);
        $this->assertSame(1, DB::table('leads')->count());

        $lead = $this->getJson("/api/v1/admin/leads/{$leadId}")->assertOk()
            ->assertJsonPath('data.name', 'Ana Pérez')->assertJsonPath('data.company_name', 'ACME SAC')->assertJsonPath('data.channel_code', 'web')
            ->assertJsonPath('data.stage_name', 'Nuevo')->assertJsonPath('data.status', 'open')->assertJsonPath('data.marketing_consent', true)
            ->assertJsonPath('data.attribution.page_url', 'https://www.marca-a.test/planes/')->assertJsonPath('data.attribution.campaign', 'hosting')
            ->assertJsonPath('data.activities.0.notes', 'Quiero cotizar hosting.');
        $version = $lead->json('data.version');

        // Mover de etapa (con historial), actividad y asignación.
        $moved = $this->postJson("/api/v1/admin/leads/{$leadId}/move-stage", ['version' => $version, 'stage_id' => $this->stage('contacted'), 'source' => 'board_drag'])->assertOk()->assertJsonPath('data.stage_name', 'Contactado');
        $this->assertSame($version + 1, $moved->json('data.version'));
        $this->postJson("/api/v1/admin/leads/{$leadId}/activities", ['type' => 'call', 'notes' => 'Se llamó y pidió propuesta.'])->assertCreated()->assertJsonCount(2, 'data.activities');
        $this->assertNotNull(DB::table('leads')->where('id', $leadId)->value('last_activity_at'));
        $this->patchJson("/api/v1/admin/leads/{$leadId}", ['version' => $version + 1, 'owner_id' => $this->admin->id, 'estimated_amount_minor' => 120000, 'currency' => 'PEN'])->assertOk()
            ->assertJsonPath('data.owner_name', $this->admin->name)->assertJsonPath('data.estimated_amount_minor', 120000);
        $this->assertSame(['Nuevo', 'Contactado'], array_column($this->getJson("/api/v1/admin/leads/{$leadId}")->json('data.stage_changes'), 'to_stage'));

        // Ganar sin ir por la conversión no se puede: la etapa Ganado se rechaza en move-stage.
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$leadId}/move-stage", ['version' => $version + 2, 'stage_id' => $this->stage('won')]), 422, 'validation_failed');

        // Ganar: crea cliente y contacto principal, sin acceso al portal.
        $won = $this->postJson("/api/v1/admin/leads/{$leadId}/convert", ['version' => $version + 2])->assertCreated()
            ->assertJsonPath('data.status', 'won')->assertJsonPath('data.stage_name', 'Ganado')->assertJsonPath('data.customer_created', true)->assertJsonPath('data.customer_name', 'ACME SAC');
        $customerId = $won->json('data.customer_id');
        $this->assertNotNull($won->json('data.converted_at'));
        $customer = DB::table('customers')->where('id', $customerId)->first();
        $this->assertSame(['company', 'ana@cliente.pe', $this->brand], [$customer->type, $customer->email, $customer->origin_brand_id]);
        $contact = DB::table('contacts')->where('customer_id', $customerId)->first();
        $this->assertTrue($contact->is_primary);
        $this->assertSame('ana@cliente.pe', $contact->email);
        $this->assertNull($contact->user_id);
        $this->assertSame(0, DB::table('users')->where('type', 'customer')->count());
        $this->assertSame(1, DB::table('communication_consents')->where('contact_id', $contact->id)->where('granted', true)->count());
        // Idempotente: repetir devuelve el mismo cliente (incluso con versión vieja) y no duplica.
        $this->postJson("/api/v1/admin/leads/{$leadId}/convert", ['version' => $version])->assertOk()->assertJsonPath('data.customer_id', $customerId)->assertJsonPath('data.customer_created', false);
        $this->assertSame(1, DB::table('customers')->count());
        // Cerrado: ya no se edita ni se mueve.
        $this->assertProblem($this->patchJson("/api/v1/admin/leads/{$leadId}", ['version' => $won->json('data.version'), 'name' => 'Otro']), 409, 'lead_closed');
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$leadId}/lose", ['version' => $won->json('data.version'), 'reason' => 'x']), 409, 'lead_closed');

        // Auditoría sin datos personales.
        $audit = DB::table('audit_events')->where('entity_type', 'lead')->where('entity_id', $leadId)->orderBy('chain_seq')->get();
        $this->assertSame(['lead.created', 'lead.stage_changed', 'lead.activity_added', 'lead.updated', 'lead.won'], $audit->pluck('action')->all());
        foreach ($audit as $event) {
            $this->assertStringNotContainsString('ana@cliente.pe', (string) $event->before.$event->after.$event->metadata);
            $this->assertStringNotContainsString('Ana', (string) $event->before.$event->after.$event->metadata);
        }
        $this->assertSame(3, DB::table('lead_stage_changes')->where('lead_id', $leadId)->count());
    }

    public function test_lost_requires_reason_and_stale_version_conflicts(): void
    {
        $lead = $this->postJson('/api/v1/admin/leads', ['name' => 'Luis Rojas', 'email' => 'luis@empresa.pe', 'brand_id' => $this->brand])->assertCreated()
            ->assertJsonPath('data.channel_code', 'manual')->assertJsonPath('data.stage_name', 'Nuevo');
        $id = $lead->json('data.id');
        $v = $lead->json('data.version');

        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$id}/lose", ['version' => $v]), 422, 'validation_failed');
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$id}/lose", ['version' => $v, 'reason' => '   ']), 422, 'validation_failed');
        $this->assertProblem($this->patchJson("/api/v1/admin/leads/{$id}", ['version' => $v, 'estimated_amount_minor' => 500]), 422, 'validation_failed');

        $this->patchJson("/api/v1/admin/leads/{$id}", ['version' => $v, 'phone' => '+51911111111'])->assertOk();
        $this->assertProblem($this->patchJson("/api/v1/admin/leads/{$id}", ['version' => $v, 'phone' => '+51922222222']), 409, 'version_conflict');
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$id}/move-stage", ['version' => $v, 'stage_id' => $this->stage('negotiation')]), 409, 'version_conflict');

        $this->postJson("/api/v1/admin/leads/{$id}/lose", ['version' => $v + 1, 'reason' => 'Eligió a la competencia', 'source' => 'board_drag'])->assertOk()
            ->assertJsonPath('data.status', 'lost')->assertJsonPath('data.stage_name', 'Perdido')->assertJsonPath('data.lost_reason', 'Eligió a la competencia');

        $this->getJson('/api/v1/admin/leads?filter[status]=lost')->assertOk()->assertJsonCount(1, 'data');
        $this->getJson('/api/v1/admin/leads?filter[status]=open')->assertOk()->assertJsonCount(0, 'data');
        $this->getJson('/api/v1/admin/leads?q=LUIS')->assertOk()->assertJsonCount(1, 'data');
        $this->assertProblem($this->getJson('/api/v1/admin/leads?filter[status]=x'), 422, 'validation_failed');
    }

    public function test_conversion_links_an_existing_customer_by_email_instead_of_duplicating(): void
    {
        $existing = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Empresa Previa SAC', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand, 'email' => 'Compras@Previa.pe'])->assertCreated()->json('data.id');
        $lead = $this->postJson('/api/v1/admin/leads', ['name' => 'Compras Previa', 'email' => 'compras@previa.pe', 'brand_id' => $this->brand])->assertCreated();
        $res = $this->postJson('/api/v1/admin/leads/'.$lead->json('data.id').'/convert', ['version' => $lead->json('data.version')])->assertOk()
            ->assertJsonPath('data.customer_id', $existing)->assertJsonPath('data.customer_created', false)->assertJsonPath('data.status', 'won');
        $this->assertSame(1, DB::table('customers')->count());
        $this->assertSame($existing, $res->json('data.customer_id'));
    }

    public function test_board_options_spam_guard_and_permissions_by_role(): void
    {
        $sub = $this->submission(['name' => 'Bot']);
        DB::table('web_form_submissions')->where('id', $sub)->update(['status' => 'spam']);
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/form-submissions/{$sub}/lead"), 409, 'conflict');

        $ok = $this->submission(['email' => 'otro@cliente.pe'], consent: false);
        $leadId = $this->postJson("/api/v1/admin/web-connector/form-submissions/{$ok}/lead")->assertCreated()->json('data.lead_id');
        $this->getJson("/api/v1/admin/leads/{$leadId}")->assertJsonPath('data.marketing_consent', false);
        $board = $this->getJson('/api/v1/admin/leads/board')->assertOk()->assertJsonCount(6, 'data');
        $this->assertSame(1, count($board->json('data.0.leads')));
        $this->assertSame(['Nuevo', 'Contactado', 'Propuesta enviada', 'Negociación', 'Ganado', 'Perdido'], array_column($board->json('data'), 'name'));
        $this->getJson('/api/v1/admin/leads/options')->assertOk()->assertJsonCount(6, 'data.stages')->assertJsonPath('data.brands.0.id', $this->brand);

        // Ventas opera; soporte solo lee; finanzas lee (sales.*.view) pero no cambia nada; un rol sin ventas no ve nada.
        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->postJson("/api/v1/admin/leads/{$leadId}/activities", ['type' => 'note', 'notes' => 'Seguimiento'])->assertCreated();
        $v = DB::table('leads')->where('id', $leadId)->value('version');
        $this->postJson("/api/v1/admin/leads/{$leadId}/move-stage", ['version' => $v, 'stage_id' => $this->stage('contacted')])->assertOk();

        $this->actingAs($this->makeUser(['support'], mfa: true));
        $this->getJson('/api/v1/admin/leads')->assertOk();
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$leadId}/move-stage", ['version' => $v + 1, 'stage_id' => $this->stage('new')]), 403, 'forbidden');
        $this->assertProblem($this->postJson('/api/v1/admin/leads', ['name' => 'X Y', 'brand_id' => $this->brand]), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$leadId}/convert", ['version' => $v + 1]), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/leads/{$leadId}/activities", ['type' => 'note', 'notes' => 'x']), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/web-connector/form-submissions/{$ok}/lead"), 403, 'forbidden');

        $this->actingAs($this->makeUser(['external_accountant'], mfa: true));
        $this->assertProblem($this->getJson('/api/v1/admin/leads'), 403, 'forbidden');
    }

    public function test_board_text_search_q(): void
    {
        $this->postJson('/api/v1/admin/web-connector/form-submissions/'.$this->submission(['name' => 'Zulema Quispe', 'email' => 'zulema@acme.pe', 'company' => 'Textiles Andinos']).'/lead')->assertCreated();
        $this->postJson('/api/v1/admin/web-connector/form-submissions/'.$this->submission(['name' => 'Bruno Díaz', 'email' => 'bruno@otra.pe', 'company' => 'Otra SAC']).'/lead')->assertCreated();
        $total = fn (string $q): int => array_sum(array_map(fn ($c) => count($c['leads']), $this->getJson('/api/v1/admin/leads/board?'.http_build_query(['q' => $q]))->assertOk()->json('data')));

        $this->assertSame(2, $total(''));
        $this->assertSame(1, $total('zulema'));
        $this->assertSame(1, $total('andinos'));
        $this->assertSame(1, $total('bruno@otra'));
        $this->assertSame(0, $total('%'));
        $this->assertSame(0, $total('inexistente'));

        $this->actingAs($this->makeUser(['external_accountant'], mfa: true));
        $this->assertProblem($this->getJson('/api/v1/admin/leads/board?q=zulema'), 403, 'forbidden');
    }
}
