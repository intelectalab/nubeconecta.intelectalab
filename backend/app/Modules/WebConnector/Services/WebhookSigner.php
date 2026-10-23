<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services;

/**
 * Firma del webhook de invalidación (docs/06): `X-Hub-Signature: t=<ts>,v1=<hex>`,
 * HMAC-SHA256 de "<t>.<cuerpo crudo>" con el secreto del sitio. Es la que
 * verifica plugins/hub-connector (ventana de 5 minutos, secreto actual o previo).
 */
final class WebhookSigner
{
    public function sign(string $rawBody, string $secret, ?int $timestamp = null): string
    {
        $t = $timestamp ?? time();

        return 't='.$t.',v1='.hash_hmac('sha256', $t.'.'.$rawBody, $secret);
    }

    public function verify(string $header, string $rawBody, string $secret, int $toleranceSeconds = 300): bool
    {
        if (! preg_match('/^t=(\d+),v1=([a-f0-9]{64})$/', $header, $m) || abs(time() - (int) $m[1]) > $toleranceSeconds) {
            return false;
        }

        return hash_equals(hash_hmac('sha256', $m[1].'.'.$rawBody, $secret), $m[2]);
    }
}
