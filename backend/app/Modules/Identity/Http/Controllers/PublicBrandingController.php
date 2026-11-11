<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers;

use App\Shared\Branding\LoginBrandingSanitizer;
use App\Shared\Settings\SettingsReader;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Branding del login del portal, público y anónimo (pre-login). Un solo login
 * global: lee el ajuste global `portal.login_branding`, lo sanea y lo entrega.
 * Sin datos del cliente ni de la organización; cacheable por cualquiera.
 */
final class PublicBrandingController
{
    public function __construct(
        private readonly SettingsReader $settings,
        private readonly LoginBrandingSanitizer $sanitizer,
    ) {}

    public function loginBranding(Request $request): JsonResponse
    {
        $data = $this->sanitizer->sanitize($this->settings->get('portal.login_branding'));

        $response = response()->json(['data' => $data]);
        $response->setEtag(sha1((string) $response->getContent()));
        // Caché corta + stale-while-revalidate: un cambio del admin se ve en ~60s,
        // pero la respuesta se sirve rápida (revalida en segundo plano hasta 10 min).
        $response->headers->set('Cache-Control', 'public, max-age=60, stale-while-revalidate=600');
        $response->isNotModified($request); // 304 sin cuerpo si coincide If-None-Match

        return $response;
    }
}
