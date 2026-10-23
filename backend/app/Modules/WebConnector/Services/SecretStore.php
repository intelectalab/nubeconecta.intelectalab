<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Bóveda mínima sobre la tabla canónica `secrets` (docs/10 §1) mientras no exista
 * el módulo VLT: AES-256-GCM con nonce de 96 bits por cifrado y AAD
 * `<secrets.id>|<organization_id>`. La clave vive fuera de la base:
 * HUB_VAULT_KEY (base64 de 32 bytes) o, si falta, una derivada de APP_KEY (HKDF).
 */
final class SecretStore
{
    /** @param array<string, mixed> $metadata */
    public function put(string $organizationId, string $ownerType, string $ownerId, string $kind, string $name, string $plaintext, array $metadata = []): string
    {
        $id = (string) Str::uuid();
        $nonce = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plaintext, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $nonce, $tag, $id.'|'.$organizationId, 16);
        if ($cipher === false) {
            throw new RuntimeException('No se pudo cifrar el secreto.');
        }

        DB::table('secrets')->insert([
            'id' => $id,
            'organization_id' => $organizationId,
            'kind' => $kind,
            'name' => $name,
            'owner_type' => $ownerType,
            'owner_id' => $ownerId,
            // base64 solo contiene [A-Za-z0-9+/=]: seguro dentro del literal.
            'ciphertext' => DB::raw("decode('".base64_encode($cipher.$tag)."', 'base64')"),
            'nonce' => DB::raw("decode('".base64_encode($nonce)."', 'base64')"),
            'key_version' => (int) config('hub.vault.key_version', 1),
            'metadata' => json_encode($metadata ?: new \stdClass, JSON_THROW_ON_ERROR),
            'last_rotated_at' => now(),
        ]);

        return $id;
    }

    public function reveal(string $id): string
    {
        $row = DB::table('secrets')->where('id', $id)->whereNull('deleted_at')
            ->selectRaw("organization_id, encode(ciphertext, 'base64') as ct, encode(nonce, 'base64') as nonce")
            ->first() ?? throw new RuntimeException('Secreto inexistente.');
        $raw = base64_decode(str_replace(["\n", "\r"], '', (string) $row->ct), true);
        $nonce = base64_decode(str_replace(["\n", "\r"], '', (string) $row->nonce), true);
        $plain = openssl_decrypt(substr((string) $raw, 0, -16), 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, (string) $nonce, substr((string) $raw, -16), $id.'|'.$row->organization_id);

        return $plain === false ? throw new RuntimeException('No se pudo descifrar el secreto.') : $plain;
    }

    /** Deja de usarse a partir de $until (el anterior durante la rotación). */
    public function expire(string $id, \DateTimeInterface $until): void
    {
        DB::table('secrets')->where('id', $id)->update(['expires_at' => $until, 'updated_at' => now(), 'version' => DB::raw('version + 1')]);
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
        $appKey = (string) config('app.key');
        $material = str_starts_with($appKey, 'base64:') ? (string) base64_decode(substr($appKey, 7)) : $appKey;
        if ($material === '') {
            throw new RuntimeException('Falta HUB_VAULT_KEY o APP_KEY para la bóveda.');
        }

        return hash_hkdf('sha256', $material, 32, 'hub-vault-v1');
    }
}
