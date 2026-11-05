<?php

declare(strict_types=1);

namespace Tests\Feature\Work;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class TasksTest extends IdentityTestCase
{
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    public function test_create_edit_assign_and_transition_lifecycle(): void
    {
        $id = $this->postJson('/api/v1/admin/tasks', ['title' => 'Preparar entorno'])->assertCreated()
            ->assertJsonPath('data.number', 'TAR-000001')->assertJsonPath('data.status', 'todo')->json('data.id');
        $this->patchJson("/api/v1/admin/tasks/{$id}", ['version' => 1, 'title' => 'Preparar producción'])->assertOk()
            ->assertJsonPath('data.title', 'Preparar producción')->assertJsonPath('data.version', 2);
        $this->postJson("/api/v1/admin/tasks/{$id}/assign", ['assignee_id' => $this->admin->id, 'version' => 2])->assertOk()
            ->assertJsonPath('data.assignee.id', $this->admin->id)->assertJsonPath('data.version', 3);
        $this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'in_progress', 'version' => 3])->assertOk()->assertJsonPath('data.status', 'in_progress');
        $this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'in_review', 'version' => 4])->assertOk()->assertJsonPath('data.status', 'in_review');
        $done = $this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'done', 'version' => 5])->assertOk()
            ->assertJsonPath('data.status', 'done');
        $this->assertNotEmpty($done->json('data.completed_at'));
        $this->assertProblem($this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'todo', 'version' => 6]), 422, 'validation_failed');
    }

    public function test_approval_is_required_before_done_and_requires_approve_permission(): void
    {
        $id = $this->postJson('/api/v1/admin/tasks', ['title' => 'Cambio delicado', 'requires_approval' => true])->assertCreated()->json('data.id');
        $this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'in_progress', 'version' => 1])->assertOk();
        $this->assertProblem($this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'done', 'version' => 2]), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/tasks/{$id}/approve", ['version' => 2])->assertOk()->assertJsonPath('data.approved_by', $this->admin->id);
        $this->postJson("/api/v1/admin/tasks/{$id}/status", ['status' => 'done', 'version' => 3])->assertOk()->assertJsonPath('data.status', 'done');

        $staff = $this->makeUser(['support'], mfa: true);
        $this->actingAs($staff);
        $this->assertProblem($this->postJson("/api/v1/admin/tasks/{$id}/approve", ['version' => 4]), 403, 'forbidden');
    }

    public function test_tasks_are_scoped_to_the_current_organization(): void
    {
        $this->postJson('/api/v1/admin/tasks', ['title' => 'Privada'])->assertCreated();
        $otherOrganizationId = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $otherOrganizationId, 'name' => 'Otra organización', 'slug' => 'otra-'.Str::lower(Str::random(8)), 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        // Una tarea de OTRA organización: el admin actual no debe verla (scope global), 404.
        $foreignId = (string) Str::uuid();
        DB::table('tasks')->insert(['id' => $foreignId, 'organization_id' => $otherOrganizationId, 'number' => 'TAR-999999', 'title' => 'De otra org', 'status' => 'todo', 'priority' => 'medium']);
        $this->getJson("/api/v1/admin/tasks/{$foreignId}")->assertNotFound();
    }

    public function test_task_routes_enforce_permissions(): void
    {
        $staff = $this->makeUser(['sales'], mfa: true);
        $this->actingAs($staff);
        $this->assertProblem($this->postJson('/api/v1/admin/tasks', ['title' => 'Sin permiso']), 403, 'forbidden');
    }
}
