<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\UserSession;
use App\Modules\Identity\Services\Totp;
use Illuminate\Support\Facades\DB;

final class AuthLoginTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    public function test_login_without_mfa_opens_session_and_me_lists_permissions(): void
    {
        $user = $this->makeUser(['support'], self::PASSWORD);

        $this->postJson('/api/v1/auth/login', ['email' => strtoupper($user->email), 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.mfa_required', false)
            ->assertJsonPath('data.user.email', $user->email);

        $me = $this->getJson('/api/v1/auth/me')->assertOk();
        $this->assertContains('helpdesk.ticket.view', $me->json('data.permissions'));
        // security.mfa.required_for_staff = true por defecto: debe enrolarse.
        $me->assertJsonPath('data.mfa.enrollment_required', true);

        $this->assertDatabaseHas('user_sessions', ['user_id' => $user->id, 'revoked_at' => null]);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.logged_in', 'entity_id' => $user->id, 'actor_id' => $user->id]);
    }

    public function test_wrong_password_locks_account_after_max_attempts_with_same_response(): void
    {
        $user = $this->makeUser([], self::PASSWORD);

        for ($i = 1; $i <= 5; $i++) {
            $this->assertProblem($this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => 'mala-'.$i]), 422, 'validation_failed');
        }

        $user->refresh();
        $this->assertNotNull($user->locked_until);
        $this->assertTrue($user->locked_until->between(now()->addMinutes(14), now()->addMinutes(16)));

        // Con la contraseña correcta, la respuesta es idéntica a una credencial inválida.
        $locked = $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]);
        $this->assertProblem($locked, 422, 'validation_failed');
        $locked->assertJsonPath('errors.email.0', __('problems.invalid_credentials'));

        $this->assertDatabaseHas('audit_events', ['action' => 'user.locked', 'entity_id' => $user->id]);
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();
    }

    public function test_disabled_or_unknown_user_cannot_login(): void
    {
        $user = $this->makeUser([], self::PASSWORD);
        $user->forceFill(['status' => 'disabled', 'disabled_at' => now()])->save();

        $this->assertProblem($this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]), 422, 'validation_failed');
        $this->assertProblem($this->postJson('/api/v1/auth/login', ['email' => 'nadie@example.com', 'password' => self::PASSWORD]), 422, 'validation_failed');
    }

    public function test_login_with_totp_requires_second_step(): void
    {
        $user = $this->makeUser(['admin'], self::PASSWORD, mfa: true);

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()
            ->assertJsonPath('data.mfa_required', true)
            ->assertJsonMissingPath('data.user');

        // Aún sin sesión.
        $this->getJson('/api/v1/auth/me')->assertUnauthorized();

        $this->assertProblem($this->postJson('/api/v1/auth/mfa/verify', ['method' => 'totp', 'code' => '000000']), 422, 'validation_failed');

        $code = Totp::code($user->mfa_secret);
        $this->postJson('/api/v1/auth/mfa/verify', ['method' => 'totp', 'code' => $code])
            ->assertOk()
            ->assertJsonPath('data.user.id', $user->id)
            ->assertJsonPath('data.user.mfa.enabled', true);

        $this->getJson('/api/v1/admin/users')->assertOk();
        $this->assertNotNull(UserSession::query()->where('user_id', $user->id)->value('mfa_verified_at'));

        // El mismo código no vale dos veces (step-up con código ya usado).
        $this->assertProblem($this->postJson('/api/v1/auth/mfa/step-up', ['code' => $code]), 422, 'validation_failed');
    }

    public function test_totp_enrollment_and_disable_with_recent_mfa(): void
    {
        $user = $this->makeUser(['support'], self::PASSWORD);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();

        // Sin MFA activa, la política lo exige: solo puede enrolarse.
        $this->assertProblem($this->getJson('/api/v1/admin/users'), 403, 'mfa_required');

        $secret = $this->postJson('/api/v1/auth/mfa/totp')->assertOk()->json('data.secret');
        $this->assertProblem($this->postJson('/api/v1/auth/mfa/totp/confirm', ['code' => '123456']), 422, 'validation_failed');

        $codes = $this->postJson('/api/v1/auth/mfa/totp/confirm', ['code' => Totp::code($secret)])
            ->assertCreated()
            ->json('data.recovery_codes');
        $this->assertCount(10, $codes);
        $this->assertTrue($user->refresh()->hasMfa());
        $this->assertSame(10, DB::table('mfa_recovery_codes')->where('user_id', $user->id)->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'user.mfa_enabled', 'entity_id' => $user->id]);

        // Recién verificada, pero la política la exige: no puede quedarse sin segundo factor.
        $this->assertProblem($this->deleteJson('/api/v1/auth/mfa/totp'), 403, 'forbidden');

        // Sin la exigencia, sí puede desactivarla.
        $this->setSetting('security.mfa.required_for_staff', false);
        $this->deleteJson('/api/v1/auth/mfa/totp')->assertNoContent();
        $this->assertFalse($user->refresh()->hasMfa());
    }

    public function test_disable_totp_without_recent_mfa_is_rejected(): void
    {
        $user = $this->makeUser(['support'], self::PASSWORD, mfa: true);
        $this->actingAs($user); // sesión sin marca de MFA reciente

        $this->assertProblem($this->deleteJson('/api/v1/auth/mfa/totp'), 403, 'mfa_required');
    }

    public function test_recovery_code_is_single_use(): void
    {
        $user = $this->makeUser(['support'], self::PASSWORD);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]);
        $secret = $this->postJson('/api/v1/auth/mfa/totp')->json('data.secret');
        $recovery = $this->postJson('/api/v1/auth/mfa/totp/confirm', ['code' => Totp::code($secret)])->json('data.recovery_codes.0');
        $this->postJson('/api/v1/auth/logout')->assertNoContent();

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertJsonPath('data.mfa_required', true);
        $this->postJson('/api/v1/auth/mfa/verify', ['method' => 'recovery', 'code' => $recovery])->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD]);
        $this->assertProblem($this->postJson('/api/v1/auth/mfa/verify', ['method' => 'recovery', 'code' => $recovery]), 422, 'validation_failed');
    }

    public function test_logout_and_remote_revocation_end_the_session(): void
    {
        $user = $this->makeUser(['support'], self::PASSWORD);

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();
        $this->postJson('/api/v1/auth/logout')->assertNoContent();
        $this->assertProblem($this->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
        $this->assertNotNull(UserSession::query()->where('user_id', $user->id)->value('revoked_at'));

        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])->assertOk();
        UserSession::query()->where('user_id', $user->id)->update(['revoked_at' => now()]);
        $this->assertProblem($this->getJson('/api/v1/auth/me'), 401, 'unauthenticated');
    }
}
