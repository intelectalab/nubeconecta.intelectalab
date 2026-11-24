<?php

declare(strict_types=1);

namespace App\Modules\Vault\Services;

use Illuminate\Support\Str;
use RuntimeException;

/**
 * Cifrado de la bóveda (docs/10 §1, M-VLT): AES-256-GCM con nonce de 96 bits por
 * cifrado y AAD `<secrets.id>|<organization_id>`. La clave vive fuera de la base
 * (HUB_VAULT_KEY, base64 de 32 bytes) o, solo en desarrollo, una derivada de
 * APP_KEY (HKDF). Un respaldo de la base sin la clave no expone ningún acceso.
 */
final class VaultCipher
{
    /**
     * @return array{ciphertext: string, nonce: string, key_version: int}  (ciphertext/nonce en binario)
     */
    public function encrypt(string $id, string $organizationId, string $plaintext): array
    {
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $nonce, $tag, $id.'|'.$organizationId, 16);
        if ($cipher === false) {
            throw new RuntimeException('No se pudo cifrar el secreto.');
        }

        return ['ciphertext' => $cipher.$tag, 'nonce' => $nonce, 'key_version' => (int) config('hub.vault.key_version', 1)];
    }

    public function decrypt(string $id, string $organizationId, string $ciphertext, string $nonce): string
    {
        $plain = openssl_decrypt(substr($ciphertext, 0, -16), 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $nonce, substr($ciphertext, -16), $id.'|'.$organizationId);

        return $plain === false ? throw new RuntimeException('No se pudo descifrar el secreto.') : $plain;
    }

    private function key(): string
    {
        $configured = (string) config('hub.vault.key', '');
        if ($configured !== '') {
            $key = base64_decode(Str::after($configured, 'base64:'), true);
            if ($key === false || strlen($key) !== 32) {
                throw new RuntimeException('HUB_VAULT_KEY debe ser base64 de 32 bytes.');
            }

            return $key;
        }
        if (app()->environment('production')) {
            throw new RuntimeException('HUB_VAULT_KEY es obligatoria en producción (base64 de 32 bytes).');
        }
        $appKey = (string) config('app.key');
        $material = str_starts_with($appKey, 'base64:') ? (string) base64_decode(substr($appKey, 7)) : $appKey;
        if ($material === '') {
            throw new RuntimeException('Falta HUB_VAULT_KEY o APP_KEY para la bóveda.');
        }

        return hash_hkdf('sha256', $material, 32, 'hub-vault-v1');
    }
}
