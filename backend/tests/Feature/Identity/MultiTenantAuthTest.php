<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Identity\Models\Organization;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\Totp;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\QueryException;

/**
 * Multitenancy Fase 1 (Opción A). Con dos inquilinos:
 * - el login identifica al inquilino a partir del correo (sin subdominio);
 * - cada petición autenticada queda aislada a la organización de su usuario;
 * - el correo es único en todo el sistema.
 */
final class MultiTenantAuthTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    private User $userA;

    private User $userB;

    private Organization $orgB;

    protected function setUp(): void
    {
        parent::setUp();

        // Org A = la organización por defecto (ya sembrada por IdentitySeeder).
        $this->userA = $this->makeUser(['admin'], self::PASSWORD, mfa: true);

        // Org B = segundo inquilino con sus propios roles de sistema.
        $this->orgB = Organization::query()->create(['name' => 'Inquilino B', 'slug' => 'inquilino-b', 'country' => 'PE']);
        app(IdentitySeeder::class)->seedRolesFor($this->orgB->id);
        $this->userB = $this->makeTenantUser($this->orgB->id, 'admin');

        // Que la organización operadora de la petición la fije el middleware, no el setup.
        app(CurrentOrganization::class)->set(null);
        $this->app->forgetScopedInstances();
    }

    public function test_login_resolves_tenant_from_email_across_organizations(): void
    {
        // El usuario de Org B no está en la organización por defecto; sin la Opción A
        // el login no lo encontraría (quedaría scopeado a Org A) y respondería 422.
        $this->postJson('/api/v1/auth/login', ['email' => strtoupper($this->userB->email), 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.mfa_required', true);

        $this->postJson('/api/v1/auth/mfa/verify', ['method' => 'totp', 'code' => Totp::code($this->userB->mfa_secret)])
            ->assertOk()
            ->assertJsonPath('data.user.id', $this->userB->id)
            ->assertJsonPath('data.user.email', $this->userB->email);

        // Y la sesión opera dentro de Org B: solo ve a los usuarios de su inquilino.
        $this->getJson('/api/v1/admin/users')
            ->assertOk()
            ->assertJsonFragment(['email' => $this->userB->email])
            ->assertJsonMissing(['email' => $this->userA->email]);
    }

    public function test_requests_of_tenant_b_user_only_see_tenant_b(): void
    {
        $this->actingAs($this->userB);
        $this->getJson('/api/v1/admin/users')
            ->assertOk()
            ->assertJsonFragment(['email' => $this->userB->email])
            ->assertJsonMissing(['email' => $this->userA->email]);
    }

    public function test_requests_of_tenant_a_user_only_see_tenant_a(): void
    {
        $this->actingAs($this->userA);
        $this->getJson('/api/v1/admin/users')
            ->assertOk()
            ->assertJsonFragment(['email' => $this->userA->email])
            ->assertJsonMissing(['email' => $this->userB->email]);
    }

    public function test_route_model_binding_does_not_cross_tenants(): void
    {
        $this->actingAs($this->userA);
        // El usuario de Org B no existe para un operador de Org A: 404, no 403.
        $this->getJson('/api/v1/admin/users/'.$this->userB->id)->assertNotFound();
    }

    public function test_email_is_unique_across_the_whole_system(): void
    {
        $this->expectException(QueryException::class);

        User::factory()
            ->state(['organization_id' => $this->orgB->id, 'type' => 'staff', 'email' => $this->userA->email])
            ->create();
    }

    private function makeTenantUser(string $organizationId, string $roleCode): User
    {
        $user = User::factory()
            ->state(['organization_id' => $organizationId, 'type' => 'staff'])
            ->withPassword(self::PASSWORD)
            ->state(['mfa_secret' => Totp::generateSecret(), 'mfa_method' => 'totp', 'mfa_enabled_at' => now()])
            ->create();

        $role = Role::query()->withoutGlobalScope('organization')
            ->where('organization_id', $organizationId)->where('code', $roleCode)->firstOrFail();
        $user->roles()->attach($role->id, ['organization_id' => $organizationId]);

        return $user->refresh();
    }
}
