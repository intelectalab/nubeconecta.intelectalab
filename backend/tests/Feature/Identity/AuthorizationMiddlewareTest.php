<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Modules\Identity\Services\Totp;

final class AuthorizationMiddlewareTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    public function test_permission_middleware_denies_missing_permission_and_allows_granted_permission(): void
    {
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->setSetting('security.mfa.required_for_admin', false);

        $this->actingAs($this->makeUser(['sales']));
        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'forbidden');

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->makeUser(['admin']));
        $this->getJson('/api/v1/admin/users')->assertOk()->assertJsonStructure(['data']);
    }

    public function test_recent_mfa_middleware_challenges_until_session_mfa_is_verified(): void
    {
        $this->setSetting('security.mfa.required_for_staff', false);
        $user = $this->makeUser(['support'], self::PASSWORD, mfa: true);

        $this->actingAs($user);
        $this->assertProblem($this->deleteJson('/api/v1/auth/mfa/totp'), 403, 'mfa_required');

        // Reproducir el inicio de sesión y la verificación TOTP que usan AuthLoginTest.
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.mfa_required', true);
        $this->postJson('/api/v1/auth/mfa/verify', [
            'method' => 'totp', 'code' => Totp::code($user->mfa_secret),
        ])->assertOk()->assertJsonPath('data.user.id', $user->id);

        $this->deleteJson('/api/v1/auth/mfa/totp')->assertNoContent();
    }
}
