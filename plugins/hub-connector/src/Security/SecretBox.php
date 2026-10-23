<?php

namespace HubConnector\Security;

/**
 * Cifrado de credenciales en opciones (docs/13 §4): AES-256-GCM con una clave
 * derivada de AUTH_KEY y SECURE_AUTH_SALT de wp-config.php y del id del sitio.
 * Formato guardado: "hubc1:" + base64(iv[12] . tag[16] . texto cifrado).
 */
final class SecretBox
{
    private const PREFIX = 'hubc1:';
    private const CIPHER = 'aes-256-gcm';

    public function __construct(private string $key)
    {
        if (strlen($key) !== 32) {
            throw new \InvalidArgumentException('La clave debe tener 32 bytes.');
        }
    }

    public static function fromWordPress(): self
    {
        $material = (defined('AUTH_KEY') ? (string) AUTH_KEY : '') . '|' . (defined('SECURE_AUTH_SALT') ? (string) SECURE_AUTH_SALT : '');
        $blogId = function_exists('get_current_blog_id') ? (string) get_current_blog_id() : '1';

        return new self(hash_hkdf('sha256', $material, 32, 'hub-connector/secret-box/v1', $blogId));
    }

    /** True si wp-config.php no define sales propias (clave débil). */
    public static function saltsMissing(): bool
    {
        foreach (['AUTH_KEY', 'SECURE_AUTH_SALT'] as $name) {
            $value = defined($name) ? (string) constant($name) : '';
            if (strlen($value) < 32 || $value === 'put your unique phrase here') {
                return true;
            }
        }

        return false;
    }

    public function encrypt(string $plain): string
    {
        $iv = random_bytes(12);
        $tag = '';
        $cipher = openssl_encrypt($plain, self::CIPHER, $this->key, OPENSSL_RAW_DATA, $iv, $tag, '', 16);
        if ($cipher === false) {
            throw new \RuntimeException('No se pudo cifrar.');
        }

        return self::PREFIX . base64_encode($iv . $tag . $cipher);
    }

    /** Null si el valor no es un cifrado válido con esta clave (p. ej., cambiaron las sales). */
    public function decrypt(string $stored): ?string
    {
        if (!self::isEncrypted($stored)) {
            return null;
        }
        $raw = base64_decode(substr($stored, strlen(self::PREFIX)), true);
        if ($raw === false || strlen($raw) < 29) {
            return null;
        }
        $plain = openssl_decrypt(substr($raw, 28), self::CIPHER, $this->key, OPENSSL_RAW_DATA, substr($raw, 0, 12), substr($raw, 12, 16));

        return $plain === false ? null : $plain;
    }

    public static function isEncrypted(string $value): bool
    {
        return strncmp($value, self::PREFIX, strlen(self::PREFIX)) === 0;
    }
}
