<?php

declare(strict_types=1);

namespace Tests\Feature\Inventory;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class InventoryTest extends IdentityTestCase
{
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
    }

    public function test_resource_creation_cost_pair_and_api_status_rules(): void
    {
        $this->postJson('/api/v1/admin/resources', ['type' => 'server', 'name' => 'srv-1'])
            ->assertCreated()->assertJsonPath('data.status', 'active')->assertJsonPath('data.sync_mode', 'manual');
        $this->assertProblem($this->postJson('/api/v1/admin/resources', ['type' => 'server', 'name' => 'srv-2', 'cost_minor' => 1200]), 422, 'validation_failed');
        $this->assertProblem($this->postJson('/api/v1/admin/resources', ['type' => 'server', 'name' => 'srv-3', 'status' => 'not_found']), 422, 'validation_failed');
    }

    public function test_server_uniqueness_and_hosting_node_own_vps_requires_server(): void
    {
        $resource = $this->postJson('/api/v1/admin/resources', ['type' => 'server', 'name' => 'Compute'])->assertCreated()->json('data.id');
        $server = $this->postJson('/api/v1/admin/servers', ['resource_id' => $resource, 'hostname' => 'compute.example.test'])->assertCreated()->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/servers', ['resource_id' => $resource, 'hostname' => 'duplicate.example.test']), 422, 'validation_failed');

        $nodeResource = $this->postJson('/api/v1/admin/resources', ['type' => 'hosting_node', 'name' => 'WHM Node'])->assertCreated()->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/hosting-nodes', ['resource_id' => $nodeResource, 'kind' => 'own_vps', 'hostname' => 'node.example.test']), 422, 'validation_failed');
        $this->postJson('/api/v1/admin/hosting-nodes', ['resource_id' => $nodeResource, 'kind' => 'own_vps', 'server_id' => $server, 'hostname' => 'node.example.test'])->assertCreated();
    }

    public function test_hosting_account_username_is_unique_per_node_and_version_is_guarded(): void
    {
        $nodeResource = $this->postJson('/api/v1/admin/resources', ['type' => 'hosting_node', 'name' => 'Reseller'])->assertCreated()->json('data.id');
        $node = $this->postJson('/api/v1/admin/hosting-nodes', ['resource_id' => $nodeResource, 'kind' => 'reseller', 'hostname' => 'node.example.test'])->assertCreated()->json('data.id');
        $payload = ['hosting_node_id' => $node, 'username' => 'client1', 'primary_domain' => 'client1.example.test'];
        $id = $this->postJson('/api/v1/admin/hosting-accounts', $payload)->assertCreated()->json('data.id');
        $this->assertProblem($this->postJson('/api/v1/admin/hosting-accounts', $payload), 422, 'validation_failed');
        $this->patchJson("/api/v1/admin/hosting-accounts/{$id}", ['version' => 1, 'primary_domain' => 'updated.example.test'])->assertOk()->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("/api/v1/admin/hosting-accounts/{$id}", ['version' => 1, 'primary_domain' => 'stale.example.test']), 409, 'version_conflict');
    }

    public function test_resource_isolation_and_inventory_permissions(): void
    {
        $foreignOrg = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $foreignOrg, 'name' => 'Otra org', 'slug' => 'otra-'.Str::lower(Str::random(8))]);
        $foreignResource = (string) Str::uuid(); $now = now();
        DB::table('resources')->insert(['id' => $foreignResource, 'organization_id' => $foreignOrg, 'type' => 'server', 'name' => 'Ajeno', 'status' => 'active', 'specs' => '{}', 'sync_mode' => 'manual', 'custom' => '{}', 'version' => 1, 'created_at' => $now, 'updated_at' => $now]);
        $this->getJson("/api/v1/admin/resources/{$foreignResource}")->assertNotFound();

        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->assertProblem($this->postJson('/api/v1/admin/resources', ['type' => 'server', 'name' => 'No access']), 403, 'forbidden');
    }
}
