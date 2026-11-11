<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Identity\Models\PersonalAccessToken;
use App\Modules\Identity\Models\Role;
use Illuminate\Support\Facades\DB;
use Throwable;

/** Endurecimiento para producción: usuario de BD restringido, vencimiento de tokens y rol admin protegido. */
final class ProductionHardeningTest extends IdentityTestCase
{
    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    public function test_restricted_database_user_inherits_hub_app_without_ddl(): void
    {
        config(['hub.database.app_password' => '']);
        $this->artisan('hub:db:app-user')->assertFailed();
        config(['hub.database.app_password' => 'clave-de-prueba-larga-123', 'hub.database.app_username' => 'hub_app_test']);
        $this->artisan('hub:db:app-user')->assertSuccessful();
        $this->artisan('hub:db:app-user')->assertSuccessful(); // idempotente (ALTER ROLE)

        $role = DB::selectOne("select rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolbypassrls, rolinherit from pg_roles where rolname = 'hub_app_test'");
        $this->assertTrue($role->rolcanlogin && $role->rolinherit);
        $this->assertFalse($role->rolsuper || $role->rolcreatedb || $role->rolcreaterole || $role->rolbypassrls);
        $this->assertNotNull(DB::selectOne("select 1 as ok from pg_auth_members m join pg_roles r on r.oid = m.roleid join pg_roles u on u.oid = m.member where r.rolname = 'hub_app' and u.rolname = 'hub_app_test'"));

        DB::statement('SET ROLE hub_app_test');
        try {
            $this->assertIsInt((int) DB::selectOne('select count(*) as n from customers')->n);
            foreach (['CREATE TABLE intruso (id int)', 'DROP TABLE customers', 'UPDATE audit_events SET action = action', 'DELETE FROM permissions', 'ALTER TABLE customers ADD COLUMN x int'] as $sql) {
                $denied = false;
                try {
                    DB::transaction(fn () => DB::statement($sql));
                } catch (Throwable) {
                    $denied = true;
                }
                $this->assertTrue($denied, $sql);
            }
        } finally {
            DB::statement('RESET ROLE');
        }
    }

    public function test_bearer_tokens_expire_and_are_pruned(): void
    {
        $this->assertSame(480, config('sanctum.expiration'));
        $user = $this->makeUser(['support']);
        $plain = $user->createToken('api')->plainTextToken;
        $this->assertNotNull(PersonalAccessToken::query()->value('organization_id'));

        $this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$plain}"])->assertOk();
        $this->travel(481)->minutes();
        $this->app['auth']->forgetGuards();
        $this->assertProblem($this->getJson('/api/v1/auth/me', ['Authorization' => "Bearer {$plain}"]), 401, 'unauthenticated');

        $this->artisan('schedule:list')->expectsOutputToContain('sanctum:prune-expired')->assertSuccessful();
        $this->artisan('sanctum:prune-expired', ['--hours' => 0])->assertSuccessful();
        $this->assertSame(0, DB::table('personal_access_tokens')->count());
    }

    public function test_superadmin_role_keeps_minimum_permissions_and_an_active_user(): void
    {
        // El rol protegido contra lockout es superadmin (break-glass); gestionar roles/usuarios es superadmin-only.
        $a = $this->makeUser(['superadmin'], mfa: true);
        $b = $this->makeUser(['superadmin'], mfa: true);
        $this->actAs($a);
        $superadmin = Role::query()->where('code', 'superadmin')->firstOrFail();
        $codes = $superadmin->permissions()->pluck('permissions.code')->all();

        $this->assertProblem($this->putJson("/api/v1/admin/roles/{$superadmin->id}/permissions", ['version' => $superadmin->version, 'permissions' => array_values(array_diff($codes, ['identity.role.update']))]), 409, 'admin_role_protected');
        $this->putJson("/api/v1/admin/roles/{$superadmin->id}/permissions", ['version' => $superadmin->version, 'permissions' => array_values(array_diff($codes, ['customers.customer.export']))])->assertOk();

        // Con otro superadmin activo se puede desactivar a B; luego A no puede quitarse el rol ni B ser borrado si A se va.
        $this->postJson("/api/v1/admin/users/{$b->id}/disable")->assertOk();
        $this->assertProblem($this->putJson("/api/v1/admin/users/{$a->id}/roles", ['roles' => []]), 409, 'admin_role_protected');
        $this->assertTrue($a->refresh()->roles()->where('code', 'superadmin')->exists());

        $this->postJson("/api/v1/admin/users/{$b->id}/enable")->assertOk();
        $this->actAs($b->refresh());
        $this->putJson("/api/v1/admin/users/{$a->id}/roles", ['roles' => [['id' => $superadmin->id, 'expires_at' => now()->addDay()->toIso8601String()]]])->assertOk();
        $this->deleteJson("/api/v1/admin/users/{$a->id}")->assertNoContent();
        $this->assertProblem($this->putJson("/api/v1/admin/users/{$b->id}/roles", ['roles' => []]), 409, 'admin_role_protected');
        $this->assertSame(1, DB::table('user_roles')->where('role_id', $superadmin->id)->where('user_id', $b->id)->count());
    }
}
