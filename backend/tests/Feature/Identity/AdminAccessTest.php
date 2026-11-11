<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Identity\Models\Role;
use Illuminate\Support\Facades\DB;

final class AdminAccessTest extends IdentityTestCase
{
    public function test_unauthenticated_gets_401_problem(): void
    {
        $this->assertProblem($this->getJson('/api/v1/admin/users'), 401, 'unauthenticated');
    }

    public function test_user_without_permission_gets_403(): void
    {
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->actingAs($this->makeUser(['sales']));

        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'forbidden');
        $this->assertProblem($this->postJson('/api/v1/admin/roles', ['code' => 'x_role', 'name' => 'X', 'audience' => 'staff']), 403, 'forbidden');
    }

    public function test_customer_user_cannot_use_admin_api_but_keeps_auth_endpoints(): void
    {
        $this->actingAs($this->makeUser(['customer_admin'], type: 'customer'));

        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'forbidden');
        $this->assertProblem($this->getJson('/api/v1/admin/settings'), 403, 'forbidden');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.type', 'customer');
    }

    public function test_admin_without_mfa_must_enroll_first(): void
    {
        $this->setSetting('security.mfa.required_for_staff', false); // admin siempre lo exige
        $this->actingAs($this->makeUser(['admin']));

        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'mfa_required');
    }

    public function test_admin_mfa_requirement_can_be_disabled_by_setting(): void
    {
        // security.mfa.required_for_admin=false permite al admin operar sin segundo factor.
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->setSetting('security.mfa.required_for_admin', false);
        $this->actingAs($this->makeUser(['admin']));

        $this->getJson('/api/v1/admin/users')->assertOk();
    }

    public function test_expired_role_assignment_grants_nothing(): void
    {
        $user = $this->makeUser(['admin'], mfa: true);
        DB::table('user_roles')->where('user_id', $user->id)->update(['expires_at' => now()->subMinute()]);
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->actingAs($user->refresh());

        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'forbidden');
    }

    public function test_admin_manages_users_with_cursor_pagination_audit_and_versioning(): void
    {
        $admin = $this->makeUser(['admin'], mfa: true);
        $this->makeUser();
        $this->makeUser();
        $this->actingAs($admin);

        $page = $this->getJson('/api/v1/admin/users?page[size]=2&sort=created_at')->assertOk()
            ->assertJsonCount(2, 'data')->assertJsonPath('meta.has_more', true);
        $next = $this->getJson('/api/v1/admin/users?page[size]=2&sort=created_at&page[cursor]='.$page->json('meta.next_cursor'))->assertOk();
        $this->assertCount(1, $next->json('data'));
        $this->assertProblem($this->getJson('/api/v1/admin/users?sort=password_hash'), 400, 'bad_request');

        $support = Role::query()->where('code', 'support')->value('id');
        $created = $this->postJson('/api/v1/admin/users', [
            'name' => 'Nueva Persona', 'email' => 'nueva@example.com', 'type' => 'staff',
            'password' => 'Segura-Clave-2026', 'role_ids' => [$support],
        ])->assertCreated()->assertJsonPath('data.roles.0.code', 'support')->assertJsonPath('data.must_change_password', true);
        $id = $created->json('data.id');

        $this->assertProblem($this->postJson('/api/v1/admin/users', [
            'name' => 'Corta', 'email' => 'corta@example.com', 'type' => 'staff', 'password' => 'Corta1234',
        ]), 422, 'validation_failed');

        $this->patchJson("/api/v1/admin/users/{$id}", ['version' => 1, 'name' => 'Nombre Nuevo'])->assertOk()->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("/api/v1/admin/users/{$id}", ['version' => 1, 'name' => 'Otro']), 409, 'version_conflict');

        // El guard anti-lockout exige ≥1 superadmin activo para desactivar/eliminar usuarios.
        $this->makeUser(['superadmin'], mfa: true);
        $this->postJson("/api/v1/admin/users/{$id}/disable")->assertOk()->assertJsonPath('data.status', 'disabled');
        $this->assertProblem($this->getJson('/api/v1/admin/users/no-es-uuid'), 404, 'not_found');

        $actions = DB::table('audit_events')->where('entity_id', $id)->orderBy('chain_seq')->pluck('action')->all();
        $this->assertSame(['user.created', 'user.updated', 'user.disabled'], $actions);
        $this->assertStringNotContainsString('argon2id', (string) DB::table('audit_events')->where('entity_id', $id)->value('after'));
    }

    public function test_roles_rules_system_protection_audience_and_copy(): void
    {
        // La gestión de roles (identity.role.*) es superadmin-only.
        $this->actingAs($this->makeUser(['superadmin'], mfa: true));
        $support = Role::query()->where('code', 'support')->firstOrFail();

        $this->assertProblem($this->deleteJson("/api/v1/admin/roles/{$support->id}"), 409, 'system_role_protected');
        $this->assertProblem($this->patchJson("/api/v1/admin/roles/{$support->id}", ['version' => $support->version, 'code' => 'otro']), 409, 'system_role_protected');
        $this->assertProblem($this->putJson("/api/v1/admin/roles/{$support->id}/permissions", [
            'version' => $support->version, 'permissions' => ['portal.ticket.view'],
        ]), 422, 'validation_failed');

        $copy = $this->postJson("/api/v1/admin/roles/{$support->id}/copy", ['code' => 'support_n2', 'name' => 'Soporte N2'])
            ->assertCreated()->assertJsonPath('data.is_system', false)->json('data');
        $this->assertEqualsCanonicalizing($support->permissions()->pluck('code')->all(), $copy['permissions']);

        $this->putJson("/api/v1/admin/roles/{$copy['id']}/permissions", ['version' => $copy['version'], 'permissions' => ['identity.user.view']])
            ->assertOk()->assertJsonPath('data.permissions', ['identity.user.view']);
        $this->deleteJson("/api/v1/admin/roles/{$copy['id']}")->assertNoContent();

        $this->getJson('/api/v1/admin/permissions/matrix')->assertOk()->assertJsonStructure(['data' => ['modules', 'roles']]);
    }

    public function test_role_editor_cannot_strip_or_delete_roles_beyond_own_permissions(): void
    {
        $editor = Role::query()->create(['code' => 'role_editor', 'name' => 'Editor de roles', 'audience' => 'staff']);
        $editor->syncPermissionIds(\App\Modules\Identity\Models\Permission::query()
            ->whereIn('code', ['identity.role.view', 'identity.role.update', 'identity.role.delete'])->pluck('id')->all());
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->actingAs($this->makeUser(['role_editor']));
        $support = Role::query()->where('code', 'support')->firstOrFail();

        $this->assertProblem($this->putJson("/api/v1/admin/roles/{$support->id}/permissions", [
            'version' => $support->version, 'permissions' => [],
        ]), 403, 'forbidden');
        $this->assertProblem($this->patchJson("/api/v1/admin/roles/{$support->id}", ['version' => $support->version, 'name' => 'x']), 403, 'forbidden');
        $this->assertNotEmpty($support->permissions()->pluck('code')->all());
    }

    public function test_seeder_is_idempotent_and_respects_audiences(): void
    {
        $before = [DB::table('permissions')->count(), DB::table('roles')->count(), DB::table('role_permissions')->count()];
        $this->seed(IdentitySeeder::class);
        $after = [DB::table('permissions')->count(), DB::table('roles')->count(), DB::table('role_permissions')->count()];

        $this->assertSame($before, $after);
        $this->assertSame(10, $after[1]);
        $this->assertTrue((bool) DB::table('permissions')->where('code', 'vault.secret.reveal')->value('is_sensitive'));

        $nonPortal = DB::table('permissions')->where('code', 'not like', 'portal.%')->count();
        // superadmin conserva todos los permisos del personal (comodín '*').
        $superadmin = Role::query()->where('code', 'superadmin')->firstOrFail();
        $this->assertSame($nonPortal, $superadmin->permissions()->count());
        // admin operativo = todos menos los crown jewels reservados a superadmin.
        $reserved = ['identity.role.view', 'identity.role.create', 'identity.role.update', 'identity.role.delete', 'identity.permission.view', 'identity.security_policy.view', 'identity.security_policy.update', 'customers.customer.impersonate'];
        $admin = Role::query()->where('code', 'admin')->firstOrFail();
        $this->assertSame($nonPortal - count($reserved), $admin->permissions()->count());
        $this->assertSame(0, $admin->permissions()->whereIn('code', $reserved)->count());
        $customer = Role::query()->where('code', 'customer_user')->firstOrFail();
        $this->assertSame(0, $customer->permissions()->where('code', 'not like', 'portal.%')->count());
    }

    public function test_create_superadmin_command_without_fixed_password(): void
    {
        $this->artisan('hub:create-superadmin', ['email' => 'root@example.com', '--generate' => true])->assertSuccessful();
        $this->artisan('hub:create-superadmin', ['email' => 'root@example.com', '--generate' => true])->assertFailed();

        $user = User::query()->where('email', 'root@example.com')->firstOrFail();
        $this->assertTrue($user->must_change_password);
        $this->assertSame(['superadmin'], $user->activeRoleCodes());
        $this->assertStringStartsWith('$argon2id$', $user->password_hash);
    }

    public function test_admin_cannot_manage_roles_or_permissions_superadmin_only(): void
    {
        // El admin operativo perdió la gestión de roles/permisos: es superadmin-only (anti-escalada).
        $this->actingAs($this->makeUser(['admin'], mfa: true));
        $support = Role::query()->where('code', 'support')->firstOrFail();

        $this->assertProblem($this->putJson("/api/v1/admin/roles/{$support->id}/permissions", ['version' => $support->version, 'permissions' => ['identity.user.view']]), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/roles/{$support->id}/copy", ['code' => 'copia', 'name' => 'Copia']), 403, 'forbidden');
        $this->getJson('/api/v1/admin/permissions/matrix')->assertForbidden();
    }
}
