<?php

declare(strict_types=1);

namespace Tests\Feature\Monitoring;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class MonitoringTest extends IdentityTestCase
{
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    public function test_monitor_creation_pause_and_activation(): void
    {
        $id = $this->postJson('/api/v1/admin/monitors', ['name' => 'Web', 'type' => 'http', 'target' => 'https://example.test', 'interval_seconds' => 60])
            ->assertCreated()->assertJsonPath('data.status', 'unknown')->assertJsonPath('data.is_active', true)->json('data.id');
        $this->postJson("/api/v1/admin/monitors/{$id}/pause", ['version' => 1])->assertOk()->assertJsonPath('data.is_active', false)->assertJsonPath('data.version', 2);
        $this->postJson("/api/v1/admin/monitors/{$id}/activate", ['version' => 2])->assertOk()->assertJsonPath('data.is_active', true)->assertJsonPath('data.version', 3);
    }

    public function test_incident_creation_and_state_machine(): void
    {
        $id = $this->postJson('/api/v1/admin/incidents', ['title' => 'Caída', 'severity' => 'high', 'started_at' => now()->toISOString()])
            ->assertCreated()->assertJsonPath('data.status', 'open')->assertJsonPath('data.number', 'INC-000001')->json('data.id');
        $this->postJson("/api/v1/admin/incidents/{$id}/status", ['status' => 'monitoring', 'version' => 1])->assertOk()->assertJsonPath('data.status', 'monitoring');
        $resolved = $this->postJson("/api/v1/admin/incidents/{$id}/status", ['status' => 'resolved', 'version' => 2])->assertOk()->assertJsonPath('data.status', 'resolved');
        $this->assertNotNull($resolved->json('data.resolved_at'));
        $this->assertProblem($this->postJson("/api/v1/admin/incidents/{$id}/status", ['status' => 'open', 'version' => 3]), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/incidents/{$id}/status", ['status' => 'monitoring', 'version' => 3])->assertOk()->assertJsonPath('data.resolved_at', null);
    }

    public function test_monitor_and_incident_are_isolated_by_organization(): void
    {
        $foreignOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $foreignOrg, 'name' => 'Otra org', 'slug' => 'otra-org-test']);
        $monitor = (string) Str::uuid(); $incident = (string) Str::uuid(); $now = now();
        DB::table('monitors')->insert(['id' => $monitor, 'organization_id' => $foreignOrg, 'name' => 'Ajeno', 'type' => 'http', 'target' => 'https://example.test', 'interval_seconds' => 60, 'status' => 'unknown', 'is_active' => true, 'version' => 1, 'created_at' => $now, 'updated_at' => $now]);
        DB::table('incidents')->insert(['id' => $incident, 'organization_id' => $foreignOrg, 'number' => 'INC-000001', 'title' => 'Ajeno', 'kind' => 'availability', 'severity' => 'low', 'status' => 'open', 'started_at' => $now, 'is_public' => false, 'version' => 1, 'created_at' => $now, 'updated_at' => $now]);
        $this->getJson("/api/v1/admin/monitors/{$monitor}")->assertNotFound();
        $this->getJson("/api/v1/admin/incidents/{$incident}")->assertNotFound();
    }

    public function test_permissions_are_checked_by_role(): void
    {
        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/monitors', ['name' => 'X', 'type' => 'http', 'target' => 'x', 'interval_seconds' => 60]), 403, 'forbidden');
        $this->assertProblem($this->postJson('/api/v1/admin/incidents', ['title' => 'X', 'severity' => 'low', 'started_at' => now()->toISOString()]), 403, 'forbidden');
    }
}
