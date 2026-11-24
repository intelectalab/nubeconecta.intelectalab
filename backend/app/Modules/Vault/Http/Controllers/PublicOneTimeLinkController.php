<?php

declare(strict_types=1);

namespace App\Modules\Vault\Http\Controllers;

use App\Modules\Vault\Services\VaultService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Consumo PÚBLICO de un enlace de un solo uso (sin sesión): el token ES la
 * credencial. Entrega el valor una vez y lo marca consumido. Sin caché.
 */
final class PublicOneTimeLinkController
{
    public function __construct(private readonly VaultService $vault) {}

    public function consume(Request $request, string $token): JsonResponse
    {
        $result = $this->vault->consumeOneTimeLink($token, $request);

        return response()->json(['data' => $result])->header('Cache-Control', 'no-store');
    }
}
