<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Contracts;

/**
 * Gancho del captcha de los formularios web (D-24: proveedor sin decidir).
 * enabled() en false significa que no hay proveedor configurado y el envío
 * no se bloquea por captcha (queda captcha_verified_at NULL).
 */
interface CaptchaVerifier
{
    public function enabled(): bool;

    /** true si el token es válido para la IP del visitante. */
    public function verify(?string $token, string $visitorIp): bool;
}
