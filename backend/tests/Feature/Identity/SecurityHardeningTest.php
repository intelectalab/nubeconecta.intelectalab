<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\MfaService;
use App\Modules\Identity\Services\Totp;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/** Revisión de seguridad del bloque A: cambio de contraseña obligatorio, renovación de roles y reuso de TOTP. */
final class SecurityHardeningTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    public function test_must_change_password_blocks_permissions_until_changed(): void
    {
        $user = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $user->forceFill(['must_change_password' => true])->save();
        $this->actingAs($user->refresh());

        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'password_change_required');
        $this->getJson('/api/v1/auth/me')->assertOk()->assertJsonPath('data.password.change_required', true);
        $this->getJson('/api/v1/auth/password-policy')->assertOk()->assertJsonStructure(['data' => ['min_length', 'history_count']]);

        $this->assertProblem($this->postJson('/api/v1/auth/password/change', [
            'current_password' => 'mala', 'password' => 'Nueva-Clave-2026x', 'password_confirmation' => 'Nueva-Clave-2026x',
        ]), 422, 'validation_failed');
        $this->postJson('/api/v1/auth/password/change', [
            'current_password' => self::PASSWORD, 'password' => self::PASSWORD, 'password_confirmation' => self::PASSWORD,
        ])->assertStatus(422)->assertJsonPath('errors.password.0', __('problems.password_reused'));

        $this->postJson('/api/v1/auth/password/change', [
            'current_password' => self::PASSWORD, 'password' => 'Nueva-Clave-2026x', 'password_confirmation' => 'Nueva-Clave-2026x',
        ])->assertNoContent();

        $user->refresh();
        $this->assertFalse($user->must_change_password);
        $this->assertTrue(Hash::check('Nueva-Clave-2026x', $user->password_hash));
        $this->assertSame(1, DB::table('password_histories')->where('user_id', $user->id)->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_changed', 'entity_id' => $user->id]);

        $this->actingAs($user);
        $this->getJson('/api/v1/admin/users')->assertOk();
    }

    public function test_expired_role_cannot_be_renewed_by_actor_without_its_permissions(): void
    {
        // support puede administrar usuarios solo si tiene identity.user.update: se le da un rol propio.
        $manager = Role::query()->create(['code' => 'user_manager', 'name' => 'Gestor', 'audience' => 'staff']);
        $ids = DB::table('permissions')->whereIn('code', ['identity.user.view', 'identity.user.update'])->pluck('id')->all();
        $manager->syncPermissionIds($ids);

        $actor = $this->makeUser(['user_manager'], mfa: true);
        $target = $this->makeUser([]);
        $admin = Role::query()->where('code', 'admin')->firstOrFail();
        $target->roles()->attach($admin->id, ['organization_id' => $target->organization_id, 'expires_at' => now()->subDay()]);

        $this->actingAs($actor);
        $this->assertProblem($this->putJson("/api/v1/admin/users/{$target->id}/roles", [
            'roles' => [['id' => $admin->id, 'expires_at' => null]],
        ]), 403, 'forbidden');
        $this->assertNotNull(DB::table('user_roles')->where('user_id', $target->id)->value('expires_at'));
    }

    public function test_totp_code_from_earlier_step_is_rejected_after_newer_one(): void
    {
        $user = $this->makeUser([], mfa: true);
        $mfa = app(MfaService::class);
        $secret = $user->mfa_secret;

        $this->assertTrue($mfa->verifyTotp($user, Totp::code($secret)));
        $this->assertFalse($mfa->verifyTotp($user, Totp::code($secret)), 'mismo código');
        $this->assertFalse($mfa->verifyTotp($user, Totp::code($secret, time() - Totp::PERIOD)), 'código del paso anterior');
    }
}
