<?php

declare(strict_types=1);

namespace Tests\Feature\Vault;

use App\Models\User;
use App\Modules\Identity\Services\Totp;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/**
 * Bóveda (M-VLT): el valor nunca sale en listado/vista; revelar exige concesión
 * vigente + MFA reciente y queda en bitácora.
 */
final class VaultTest extends IdentityTestCase
{
    private const PASSWORD = 'Correcta-Clave-2026';

    private const VALUE = 'S3cr3t-cPanel!';

    public function test_secret_is_hidden_and_reveal_requires_grant_then_logs(): void
    {
        $admin = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $this->loginWithMfa($admin);

        $id = $this->createSecret();

        // Ni el listado ni la vista devuelven el valor ni el cifrado.
        $list = $this->getJson('/api/v1/admin/vault/secrets')->assertOk();
        $this->assertStringNotContainsString(self::VALUE, json_encode($list->json()));
        $this->assertStringNotContainsString('ciphertext', json_encode($list->json()));
        $this->getJson("/api/v1/admin/vault/secrets/{$id}")->assertOk()->assertJsonPath('data.username', 'cpuser');

        // Revelar SIN concesión → 403 (y queda reveal_denied en bitácora).
        $this->assertProblem($this->postJson("/api/v1/admin/vault/secrets/{$id}/reveal", ['reason' => 'mantenimiento']), 403, 'forbidden');

        // Conceder acceso al propio usuario y revelar → devuelve el valor.
        $this->postJson("/api/v1/admin/vault/secrets/{$id}/grants", ['user_id' => $admin->id, 'reason' => 'soporte'])->assertCreated();
        $this->postJson("/api/v1/admin/vault/secrets/{$id}/reveal", ['reason' => 'mantenimiento'])
            ->assertOk()->assertJsonPath('data.value', self::VALUE);

        // Bitácora: una denegada y una revelación.
        $actions = array_column($this->getJson("/api/v1/admin/vault/secrets/{$id}/access-logs")->assertOk()->json('data'), 'action');
        $this->assertContains('reveal', $actions);
        $this->assertContains('reveal_denied', $actions);

        // Revocar la concesión → revelar vuelve a 403.
        $grantId = $this->getJson("/api/v1/admin/vault/secrets/{$id}/grants")->json('data.0.id');
        $this->deleteJson("/api/v1/admin/vault/secrets/{$id}/grants/{$grantId}")->assertNoContent();
        $this->assertProblem($this->postJson("/api/v1/admin/vault/secrets/{$id}/reveal", ['reason' => 'otra vez']), 403, 'forbidden');
    }

    public function test_reveal_requires_recent_mfa(): void
    {
        $admin = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $this->actingAs($admin); // sesión sin MFA reciente
        $id = $this->createSecret();
        $this->postJson("/api/v1/admin/vault/secrets/{$id}/grants", ['user_id' => $admin->id])->assertCreated();

        // Aunque tenga concesión, sin MFA reciente el middleware lo corta.
        $this->assertProblem($this->postJson("/api/v1/admin/vault/secrets/{$id}/reveal", ['reason' => 'x']), 403, 'mfa_required');
    }

    public function test_one_time_link_delivers_secret_value_once(): void
    {
        $admin = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $this->loginWithMfa($admin); // mfa.recent requerido para crear el enlace
        $id = $this->createSecret();

        $token = $this->postJson('/api/v1/admin/vault/one-time-links', ['purpose' => 'credential_delivery', 'secret_id' => $id])
            ->assertCreated()->json('meta.token');
        $this->assertNotEmpty($token);

        // Consumo público (sin sesión): entrega el valor una vez.
        $this->postJson("/api/v1/public/vault/one-time/{$token}")->assertOk()->assertJsonPath('data.value', self::VALUE);
        // Segundo intento: ya consumido.
        $this->assertProblem($this->postJson("/api/v1/public/vault/one-time/{$token}"), 404, 'link_unusable');

        // La apertura quedó en la bitácora del secreto.
        $actions = array_column($this->getJson("/api/v1/admin/vault/secrets/{$id}/access-logs")->json('data'), 'action');
        $this->assertContains('one_time_link', $actions);
    }

    public function test_free_text_link_delivers_payload_and_revoke_disables_it(): void
    {
        $admin = $this->makeUser(['admin'], self::PASSWORD, mfa: true);
        $this->loginWithMfa($admin);

        $ok = $this->postJson('/api/v1/admin/vault/one-time-links', ['purpose' => 'domain_auth_code', 'payload' => 'AUTH-CODE-123'])->assertCreated();
        $this->postJson("/api/v1/public/vault/one-time/{$ok->json('meta.token')}")->assertOk()->assertJsonPath('data.value', 'AUTH-CODE-123');

        $rev = $this->postJson('/api/v1/admin/vault/one-time-links', ['purpose' => 'domain_auth_code', 'payload' => 'OTRO-CODE'])->assertCreated();
        $this->deleteJson("/api/v1/admin/vault/one-time-links/{$rev->json('data.id')}")->assertNoContent();
        $this->assertProblem($this->postJson("/api/v1/public/vault/one-time/{$rev->json('meta.token')}"), 404, 'link_unusable');
    }

    private function createSecret(): string
    {
        return $this->postJson('/api/v1/admin/vault/secrets', [
            'kind' => 'cpanel', 'name' => 'cPanel cliente', 'owner_type' => 'service', 'owner_id' => (string) Str::uuid(),
            'username' => 'cpuser', 'host' => 'host.test', 'port' => 2083, 'value' => self::VALUE,
        ])->assertCreated()->json('data.id');
    }

    private function loginWithMfa(User $user): void
    {
        $this->postJson('/api/v1/auth/login', ['email' => $user->email, 'password' => self::PASSWORD])
            ->assertOk()->assertJsonPath('data.mfa_required', true);
        $this->postJson('/api/v1/auth/mfa/verify', ['method' => 'totp', 'code' => Totp::code($user->mfa_secret)])->assertOk();
    }
}
