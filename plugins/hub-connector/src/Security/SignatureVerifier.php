<?php

namespace HubConnector\Security;

/**
 * Verificación de X-Hub-Signature: t=<marca de tiempo>,v1=<hex>, con
 * v1 = HMAC-SHA256("<t>.<cuerpo crudo>", secreto) (docs/13 §6). Mismo cálculo
 * que App\Modules\WebConnector\Services\WebhookSigner del sistema.
 */
final class SignatureVerifier
{
    public const TOLERANCE_SECONDS = 300;

    public static function sign(string $raw, string $secret, int $timestamp): string
    {
        return 't=' . $timestamp . ',v1=' . hash_hmac('sha256', $timestamp . '.' . $raw, $secret);
    }

    /**
     * @param list<string> $secrets secreto actual y, durante la rotación, el anterior
     * @return string 'ok', 'invalid_signature' o 'stale_signature'
     */
    public function verify(string $header, string $raw, array $secrets, int $now): string
    {
        if (!preg_match('/^t=(\d{1,12}),v1=([a-f0-9]{64})$/', trim($header), $m)) {
            return 'invalid_signature';
        }
        $timestamp = (int) $m[1];
        $valid = false;
        foreach ($secrets as $secret) {
            if ($secret !== '' && hash_equals(hash_hmac('sha256', $timestamp . '.' . $raw, $secret), $m[2])) {
                $valid = true;
            }
        }
        if (!$valid) {
            return 'invalid_signature';
        }

        return abs($now - $timestamp) > self::TOLERANCE_SECONDS ? 'stale_signature' : 'ok';
    }
}
