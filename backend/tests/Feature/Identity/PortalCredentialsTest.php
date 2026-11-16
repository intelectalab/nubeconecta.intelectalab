<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Models\User;
use App\Modules\Customers\Events\ContactPortalAccessGranted;
use App\Modules\Identity\Mail\PortalLinkMail;
use App\Modules\Identity\Services\UserTokenService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;

/** Invitación al portal y "olvidé mi contraseña" (M-IDN): enlaces de un solo uso. */
final class PortalCredentialsTest extends IdentityTestCase
{
    private const PW = 'Un-Clave-Segura-2026!';

    private function invitedCustomer(string $email = 'luis@delta.pe'): User
    {
        return User::factory()->state(['type' => 'customer', 'name' => 'Luis Delta', 'email' => $email, 'password_hash' => null])->create();
    }

    /** Dispara la invitación como lo hace Customers y devuelve el token del enlace. */
    private function invite(User $user): string
    {
        Mail::fake();
        ContactPortalAccessGranted::dispatch($user->organization_id, (string) \Illuminate\Support\Str::uuid(), $user->id);

        return $this->tokenFromMail('invitation', $user->email);
    }

    private function tokenFromMail(string $kind, string $to): string
    {
        $url = null;
        Mail::assertQueued(PortalLinkMail::class, function (PortalLinkMail $m) use ($kind, $to, &$url): bool {
            if ($m->kind === $kind && $m->hasTo($to)) {
                $url = $m->url;

                return true;
            }

            return false;
        });
        $this->assertNotNull($url);
        $this->assertStringContainsString('/#/'.($kind === 'invitation' ? 'activar' : 'restablecer').'?token=', $url);
        preg_match('/token=([^&]+)/', $url, $m);

        return urldecode($m[1]);
    }

    public function test_invitation_mail_is_queued_in_spanish_and_stores_only_the_hash(): void
    {
        $user = $this->invitedCustomer();
        $token = $this->invite($user);

        Mail::assertQueued(PortalLinkMail::class, 1);
        $mail = new PortalLinkMail('invitation', 'Luis Delta', PortalLinkMail::link('invitation', $token), '72 horas');
        $html = $mail->render();
        $this->assertStringContainsString('NubeConecta', $html);
        $this->assertStringContainsString('72 horas', $html);
        $this->assertStringNotContainsStringIgnoringCase('contraseña:', $html);

        $row = DB::table('user_tokens')->where('user_id', $user->id)->first();
        $this->assertSame(hash('sha256', $token), $row->token_hash);
        $this->assertNotSame($token, $row->token_hash);
        $this->assertEqualsWithDelta(72 * 3600, strtotime($row->expires_at) - time(), 60);
    }

    public function test_resending_invalidates_the_previous_token(): void
    {
        $user = $this->invitedCustomer();
        $first = $this->invite($user);
        $second = $this->invite($user);

        $this->assertNotSame($first, $second);
        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $first]), 410, 'token_invalid');
        $this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $second])->assertOk();
    }

    public function test_verify_returns_masked_email_and_name_without_consuming(): void
    {
        $token = $this->invite($this->invitedCustomer());

        foreach ([1, 2] as $_) {
            $this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $token])
                ->assertOk()->assertJsonPath('data.name', 'Luis Delta')->assertJsonPath('data.email', 'l***@d***.pe');
        }
    }

    public function test_accept_sets_password_verifies_email_consumes_token_and_does_not_log_in(): void
    {
        $user = $this->invitedCustomer();
        $token = $this->invite($user);

        $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => self::PW, 'password_confirmation' => self::PW])->assertNoContent();

        $user->refresh();
        $this->assertNotNull($user->password_hash);
        $this->assertNotNull($user->email_verified_at);
        $this->assertDatabaseCount('user_sessions', 0);
        $this->assertDatabaseHas('audit_events', ['action' => 'user.invitation_accepted', 'entity_id' => $user->id]);
        $this->assertStringNotContainsString(self::PW, json_encode(DB::table('audit_events')->get()));

        // Un solo uso: reutilizar el enlace falla.
        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => self::PW, 'password_confirmation' => self::PW]), 410, 'token_invalid');
        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $token]), 410, 'token_invalid');

        // Y la persona ya puede iniciar sesión con la contraseña nueva.
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PW])->assertOk()->assertJsonPath('data.mfa_required', false);
    }

    public function test_expired_token_is_reported_as_expired(): void
    {
        $token = $this->invite($this->invitedCustomer());
        DB::table('user_tokens')->update(['expires_at' => now()->subMinute()]);

        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $token]), 410, 'token_expired');
        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => self::PW, 'password_confirmation' => self::PW]), 410, 'token_expired');
        $this->assertNull(User::query()->where('email', 'luis@delta.pe')->value('password_hash'));
    }

    public function test_unknown_token_is_rejected(): void
    {
        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => str_repeat('a', 64)]), 410, 'token_invalid');
    }

    public function test_password_policy_is_enforced_and_token_survives_a_rejected_password(): void
    {
        $token = $this->invite($this->invitedCustomer());

        $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => 'corta', 'password_confirmation' => 'corta'])
            ->assertStatus(422)->assertJsonPath('code', 'validation_failed')->assertJsonValidationErrors(['password']);
        $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => self::PW, 'password_confirmation' => 'otra-distinta'])
            ->assertStatus(422)->assertJsonValidationErrors(['password']);

        $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => $token, 'password' => self::PW, 'password_confirmation' => self::PW])->assertNoContent();
    }

    public function test_already_activated_account_gets_no_invitation(): void
    {
        $user = User::factory()->state(['type' => 'customer'])->withPassword(self::PW)->create();
        Mail::fake();
        ContactPortalAccessGranted::dispatch($user->organization_id, (string) \Illuminate\Support\Str::uuid(), $user->id);

        Mail::assertNothingQueued();
    }

    public function test_forgot_is_generic_and_does_not_reveal_whether_the_email_exists(): void
    {
        $known = User::factory()->state(['type' => 'customer', 'email' => 'cliente@delta.pe'])->withPassword(self::PW)->create();
        $staff = User::factory()->state(['type' => 'staff', 'email' => 'staff@hub.test'])->withPassword(self::PW)->create();
        $disabled = User::factory()->state(['type' => 'customer', 'email' => 'baja@delta.pe', 'status' => 'disabled'])->withPassword(self::PW)->create();
        Mail::fake();

        $bodies = [];
        foreach (['cliente@delta.pe', 'nadie@no-existe.pe', $staff->email, $disabled->email] as $email) {
            $r = $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => $email])->assertStatus(202);
            $bodies[] = $r->getContent();
        }
        $this->assertCount(1, array_unique($bodies));
        Mail::assertQueued(PortalLinkMail::class, 1);
        $this->tokenFromMail('password_reset', $known->email);
    }

    public function test_reset_changes_password_closes_sessions_and_is_single_use(): void
    {
        $user = User::factory()->state(['type' => 'customer', 'email' => 'cliente@delta.pe'])->withPassword(self::PW)->create();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PW])->assertOk();
        $this->assertSame(1, DB::table('user_sessions')->where('user_id', $user->id)->whereNull('revoked_at')->count());

        Mail::fake();
        $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => $user->email])->assertStatus(202);
        $token = $this->tokenFromMail('password_reset', $user->email);
        $this->assertEqualsWithDelta(3600, strtotime((string) DB::table('user_tokens')->where('user_id', $user->id)->value('expires_at')) - time(), 60);

        $new = 'Otra-Clave-Nueva-2027!';
        $this->postJson('/api/v1/portal/auth/password/reset', ['token' => $token, 'password' => $new, 'password_confirmation' => $new])->assertNoContent();

        $this->assertSame(0, DB::table('user_sessions')->where('user_id', $user->id)->whereNull('revoked_at')->count());
        $this->assertDatabaseHas('audit_events', ['action' => 'user.password_reset', 'entity_id' => $user->id]);
        $this->assertProblem($this->postJson('/api/v1/portal/auth/password/reset', ['token' => $token, 'password' => $new, 'password_confirmation' => $new]), 410, 'token_invalid');

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PW])->assertStatus(422);
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => $new])->assertOk();
    }

    public function test_reset_token_cannot_be_used_as_invitation_and_vice_versa(): void
    {
        $user = User::factory()->state(['type' => 'customer', 'email' => 'cliente@delta.pe'])->withPassword(self::PW)->create();
        $reset = app(UserTokenService::class)->issue($user, UserTokenService::PASSWORD_RESET);

        $this->assertProblem($this->postJson('/api/v1/portal/auth/invitations/verify', ['token' => $reset]), 410, 'token_invalid');
    }

    public function test_forgot_is_throttled_by_email_and_by_ip(): void
    {
        Mail::fake();
        for ($i = 0; $i < 3; $i++) {
            $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => 'misma@delta.pe'])->assertStatus(202);
        }
        $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => 'MISMA@delta.pe'])->assertStatus(429);

        // Otro correo desde la misma IP: pasa hasta agotar el límite por IP (5/min; el bloqueado cuenta).
        $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => 'otra@delta.pe'])->assertStatus(202);
        $this->postJson('/api/v1/portal/auth/password/forgot', ['email' => 'otra2@delta.pe'])->assertStatus(429);
    }

    public function test_token_endpoints_are_throttled(): void
    {
        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => 'x', 'password' => 'a', 'password_confirmation' => 'a'])->assertStatus(422);
        }
        $this->postJson('/api/v1/portal/auth/invitations/accept', ['token' => 'x', 'password' => 'a', 'password_confirmation' => 'a'])->assertStatus(429);
    }

    public function test_password_policy_is_public_for_the_activation_screens(): void
    {
        $this->getJson('/api/v1/portal/auth/password-policy')->assertOk()->assertJsonStructure(['data' => ['min_length', 'complexity']]);
    }
}
