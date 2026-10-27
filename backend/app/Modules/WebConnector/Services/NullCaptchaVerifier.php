<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Services;

use App\Modules\WebConnector\Contracts\CaptchaVerifier;

/** Sin proveedor de captcha mientras D-24 siga abierta: no verifica ni bloquea. */
final class NullCaptchaVerifier implements CaptchaVerifier
{
    public function enabled(): bool
    {
        return false;
    }

    public function verify(?string $token, string $visitorIp): bool
    {
        return false;
    }
}
