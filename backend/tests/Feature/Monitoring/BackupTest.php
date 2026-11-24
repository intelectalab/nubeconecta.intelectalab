<?php

declare(strict_types=1);

namespace Tests\Feature\Monitoring;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Respaldos (modo manual): políticas (monitoring.backup_policy.*) y corridas (monitoring.backup_run.*). */
final class BackupTest extends IdentityTestCase
{
    private User $admin;

    private string $resource;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $org = (string) DB::table('organizations')->value('id');
        $this->resource = (string) Str::uuid();
        DB::table('resources')->insert(['id' => $this->resource, 'organization_id' => $org, 'type' => 'hosting_node', 'name' => 'Nodo WHM 1', 'status' => 'active']);
    }

    public function test_policy_and_run_lifecycle(): void
    {
        $policy = $this->postJson('/api/v1/admin/backup-policies', [
            'resource_id' => $this->resource, 'name' => 'Respaldo diario nodo 1', 'frequency' => 'daily', 'retention_days' => 14, 'rpo_minutes' => 1440, 'responsibility' => 'company',
        ])->assertCreated()->assertJsonPath('data.frequency', 'daily')->assertJsonPath('data.resource.name', 'Nodo WHM 1')->json('data');

        $this->getJson('/api/v1/admin/backup-policies')->assertOk()->assertJsonPath('data.0.id', $policy['id']);

        // Corrida exitosa.
        $this->postJson('/api/v1/admin/backup-runs', [
            'backup_policy_id' => $policy['id'], 'status' => 'succeeded',
            'started_at' => now()->subHour()->toIso8601String(), 'finished_at' => now()->subMinutes(50)->toIso8601String(), 'size_bytes' => 1048576,
        ])->assertCreated()->assertJsonPath('data.status', 'succeeded')->assertJsonPath('data.policy.name', 'Respaldo diario nodo 1');

        // Fallida sin detalle de error → 422.
        $this->assertProblem($this->postJson('/api/v1/admin/backup-runs', [
            'backup_policy_id' => $policy['id'], 'status' => 'failed',
            'started_at' => now()->subHour()->toIso8601String(), 'finished_at' => now()->toIso8601String(),
        ]), 422, 'validation_failed');

        // Terminada sin hora de fin → 422.
        $this->assertProblem($this->postJson('/api/v1/admin/backup-runs', [
            'backup_policy_id' => $policy['id'], 'status' => 'succeeded', 'started_at' => now()->toIso8601String(),
        ]), 422, 'validation_failed');

        $this->getJson("/api/v1/admin/backup-runs?filter[backup_policy_id]={$policy['id']}")->assertOk()->assertJsonCount(1, 'data');

        // Editar la política.
        $this->patchJson("/api/v1/admin/backup-policies/{$policy['id']}", ['version' => $policy['version'], 'retention_days' => 30])->assertOk()->assertJsonPath('data.retention_days', 30);
        // No se puede eliminar con corridas registradas; se desactiva en su lugar.
        $this->assertProblem($this->deleteJson("/api/v1/admin/backup-policies/{$policy['id']}"), 409, 'has_dependents');
        // Una política sin corridas sí se elimina.
        $fresh = $this->postJson('/api/v1/admin/backup-policies', ['resource_id' => $this->resource, 'name' => 'Temporal', 'frequency' => 'weekly', 'retention_days' => 7])->assertCreated()->json('data');
        $this->deleteJson("/api/v1/admin/backup-policies/{$fresh['id']}")->assertNoContent();

        $this->assertNull(app(\App\Shared\Audit\AuditLogger::class)->verify());
    }

    public function test_requires_permission(): void
    {
        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->getJson('/api/v1/admin/backup-policies'), 403, 'forbidden');
    }
}
