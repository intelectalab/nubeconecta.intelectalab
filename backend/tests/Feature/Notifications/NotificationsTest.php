<?php

declare(strict_types=1);

namespace Tests\Feature\Notifications;

use App\Models\User;
use App\Modules\Notifications\Mail\NotificationMail;
use App\Modules\Notifications\Services\NotificationService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class NotificationsTest extends IdentityTestCase
{
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        Mail::fake();
    }

    public function test_create_template_and_send_queued_rendered_email(): void
    {
        $this->postJson('/api/v1/admin/notification-templates', ['code' => 'test.welcome', 'channel' => 'email', 'subject' => 'Hola {{nombre}}', 'body' => '<p>Hola {{nombre}}</p>'])
            ->assertCreated();
        $delivery = app(NotificationService::class)->send(['event' => 'test.welcome', 'template_code' => 'test.welcome', 'recipient_address' => 'person@example.test', 'variables' => ['nombre' => 'Ana'], 'dedupe_key' => 'test:welcome:one']);
        $this->assertSame('<p>Hola Ana</p>', $delivery->body_snapshot);
        $this->assertDatabaseHas('notification_delivery_events', ['notification_delivery_id' => $delivery->id, 'status' => 'queued']);
        Mail::assertQueued(NotificationMail::class);
    }

    public function test_dedupe_does_not_create_or_queue_a_second_delivery(): void
    {
        $this->makeTemplate('test.dedupe', '<p>{{name}}</p>');
        $params = ['event' => 'test.dedupe', 'template_code' => 'test.dedupe', 'recipient_address' => 'person@example.test', 'dedupe_key' => 'same-key'];
        $one = app(NotificationService::class)->send($params);
        $two = app(NotificationService::class)->send($params);
        $this->assertSame($one->id, $two->id);
        $this->assertSame(1, DB::table('notification_deliveries')->where('dedupe_key', 'same-key')->count());
        Mail::assertQueuedCount(1);
    }

    public function test_rendered_snapshot_has_interpolation_and_sanitizes_variable_html(): void
    {
        $this->makeTemplate('test.sanitize', '<p>{{name}} {{unsafe}}</p>');
        $delivery = app(NotificationService::class)->send(['event' => 'test.sanitize', 'template_code' => 'test.sanitize', 'recipient_address' => 'person@example.test', 'dedupe_key' => 'sanitize-key', 'variables' => ['name' => 'María', 'unsafe' => '<script>alert(1)</script><strong>válido</strong>']]);
        $this->assertStringContainsString('María', $delivery->body_snapshot);
        $this->assertStringNotContainsString('{{name}}', $delivery->body_snapshot);
        $this->assertStringNotContainsString('<script', $delivery->body_snapshot);
    }

    public function test_delivery_filters_and_organization_isolation(): void
    {
        $foreignOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $foreignOrg, 'name' => 'Otra org', 'slug' => 'notification-foreign-test']);
        $foreignId = (string) Str::uuid();
        DB::table('notification_deliveries')->insert(['id' => $foreignId, 'organization_id' => $foreignOrg, 'dedupe_key' => 'foreign', 'event' => 'ticket.reply', 'channel' => 'email', 'recipient_address' => 'hidden@example.test', 'created_at' => now()]);
        $this->getJson('/api/v1/admin/notification-deliveries?filter[event]=ticket.reply&filter[customer_id]=00000000-0000-4000-8000-000000000001')->assertOk();
        $this->getJson("/api/v1/admin/notification-deliveries/{$foreignId}")->assertNotFound();
    }

    public function test_role_without_permission_cannot_create_template(): void
    {
        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/notification-templates', ['code' => 'forbidden', 'channel' => 'email', 'body' => '<p>x</p>']), 403, 'forbidden');
    }

    private function makeTemplate(string $code, string $body): void
    {
        $this->postJson('/api/v1/admin/notification-templates', ['code' => $code, 'channel' => 'email', 'subject' => 'Prueba', 'body' => $body])->assertCreated();
    }
}
