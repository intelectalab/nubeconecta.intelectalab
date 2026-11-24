<?php

declare(strict_types=1);

namespace Tests\Feature\Tenancy;

use App\Models\User;
use App\Modules\Identity\Models\Organization;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\Totp;
use App\Modules\Tenancy\Models\SaasPlan;
use App\Modules\Tenancy\Services\TenantProvisioner;
use App\Shared\Organization\CurrentOrganization;
use Tests\Feature\Identity\IdentityTestCase;

/**
 * Multitenancy Fase 1 — módulo Tenancy (gestión por el operador).
 */
final class TenancyTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    private User $operatorSuperadmin;

    protected function setUp(): void
    {
        parent::setUp();
        // La organización por defecto es la operadora (IdentitySeeder la marca).
        $this->operatorSuperadmin = $this->makeUser(['superadmin'], self::PASSWORD, mfa: true);
    }

    public function test_operator_creates_a_plan_and_a_tenant_with_its_own_admin(): void
    {
        $this->actingAs($this->operatorSuperadmin);

        $plan = $this->postJson('/api/v1/admin/tenancy/plans', [
            'code' => 'pro', 'name' => 'Pro', 'price_minor' => 24900, 'currency' => 'PEN',
            'max_staff_users' => 20, 'max_customers' => 1000, 'max_services' => 2000,
        ])->assertCreated()->json('data');

        $res = $this->postJson('/api/v1/admin/tenancy/tenants', [
            'name' => 'Hosting B', 'slug' => 'hosting-b', 'saas_plan_id' => $plan['id'],
            'admin_name' => 'Admin B', 'admin_email' => 'adminb@hostingb.test',
        ])->assertCreated();

        $tenantId = $res->json('data.id');
        $adminId = $res->json('meta.admin.id');

        $this->assertNotEmpty($res->json('meta.temporary_password'));
        $this->assertDatabaseHas('organizations', ['id' => $tenantId, 'is_operator' => false, 'saas_plan_id' => $plan['id'], 'saas_status' => 'active']);
        $this->assertDatabaseHas('users', ['id' => $adminId, 'organization_id' => $tenantId, 'type' => 'staff']);
        // El inquilino tiene sus propios roles de sistema sembrados.
        $this->assertDatabaseHas('roles', ['organization_id' => $tenantId, 'code' => 'admin', 'is_system' => true]);
        $this->assertDatabaseHas('roles', ['organization_id' => $tenantId, 'code' => 'superadmin', 'is_system' => true]);
    }

    public function test_new_tenant_admin_can_log_in_with_the_temporary_password(): void
    {
        [$admin, $password] = $this->provisionTenant('hosting-c', 'adminc@hostingc.test');

        $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => $password])
            ->assertOk()
            ->assertJsonPath('data.mfa_required', false)
            ->assertJsonPath('data.user.email', $admin->email);
    }

    public function test_suspended_tenant_user_cannot_log_in(): void
    {
        [$admin, $password] = $this->provisionTenant('hosting-d', 'admind@hostingd.test');
        Organization::query()->whereKey($admin->organization_id)->update(['status' => 'suspended']);

        $this->assertProblem(
            $this->postJson('/api/v1/auth/login', ['email' => $admin->email, 'password' => $password]),
            422, 'validation_failed'
        );
    }

    public function test_operator_can_suspend_and_reactivate_a_tenant(): void
    {
        [$admin] = $this->provisionTenant('hosting-e', 'admine@hostinge.test');
        $tenantId = $admin->organization_id;

        $this->actingAs($this->operatorSuperadmin);
        $this->postJson("/api/v1/admin/tenancy/tenants/{$tenantId}/suspend")->assertOk();
        $this->assertDatabaseHas('organizations', ['id' => $tenantId, 'status' => 'suspended', 'saas_status' => 'suspended']);

        $this->postJson("/api/v1/admin/tenancy/tenants/{$tenantId}/reactivate")->assertOk();
        $this->assertDatabaseHas('organizations', ['id' => $tenantId, 'status' => 'active', 'saas_status' => 'active']);
    }

    public function test_superadmin_of_a_tenant_cannot_manage_the_platform(): void
    {
        [$admin] = $this->provisionTenant('hosting-f', 'adminf@hostingf.test');
        $tenantId = $admin->organization_id;

        $tenantSuper = User::factory()
            ->state(['organization_id' => $tenantId, 'type' => 'staff'])
            ->withPassword(self::PASSWORD)
            ->state(['mfa_secret' => Totp::generateSecret(), 'mfa_method' => 'totp', 'mfa_enabled_at' => now()])
            ->create();
        $role = Role::query()->withoutGlobalScope('organization')
            ->where('organization_id', $tenantId)->where('code', 'superadmin')->firstOrFail();
        $tenantSuper->roles()->attach($role->id, ['organization_id' => $tenantId]);

        $this->actingAs($tenantSuper);
        // La frontera del operador lo corta aunque tenga el permiso tenancy.*.
        $this->assertProblem($this->getJson('/api/v1/admin/tenancy/tenants'), 403, 'forbidden');
    }

    public function test_operator_admin_without_superadmin_is_denied_tenancy(): void
    {
        $admin = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $this->actingAs($admin);
        // admin tiene tenancy.* denegado por el seeder.
        $this->assertProblem($this->getJson('/api/v1/admin/tenancy/tenants'), 403, 'forbidden');
    }

    /**
     * @return array{0: User, 1: string}
     */
    private function provisionTenant(string $slug, string $email): array
    {
        app(CurrentOrganization::class)->set(
            Organization::query()->where('is_operator', true)->value('id')
        );
        $result = app(TenantProvisioner::class)->create([
            'name' => ucfirst($slug), 'slug' => $slug,
            'admin_name' => 'Admin', 'admin_email' => $email,
        ]);
        app(CurrentOrganization::class)->set(null);
        $this->app->forgetScopedInstances();

        return [$result['admin'], $result['temporary_password']];
    }
}
