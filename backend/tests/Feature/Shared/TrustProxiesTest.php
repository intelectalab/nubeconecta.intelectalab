<?php

declare(strict_types=1);

namespace Tests\Feature\Shared;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

/** El app corre detrás del nginx del host: $request->ip() debe ser la IP real del cliente. */
final class TrustProxiesTest extends TestCase
{
    private function ipRoute(): void
    {
        // fullUrl() fuerza getPort()/getHttpHost(): ahí reventaba el host reenviado vacío.
        Route::get('/_test/client-ip', fn (Request $r) => [
            'ip' => $r->ip(),
            'scheme' => $r->getScheme(),
            'url' => $r->fullUrl(),
        ]);
    }

    public function test_forwarded_ip_is_trusted_from_the_proxy(): void
    {
        $this->ipRoute();

        // Petición desde el proxy confiable (loopback por defecto en tests) con XFF.
        $this->get('/_test/client-ip', ['X-Forwarded-For' => '203.0.113.45'])
            ->assertOk()->assertJsonPath('ip', '203.0.113.45');
    }

    public function test_forwarded_ip_is_ignored_from_an_untrusted_source(): void
    {
        $this->ipRoute();

        // Un origen NO confiable no puede falsear su IP vía X-Forwarded-For.
        $this->withServerVariables(['REMOTE_ADDR' => '8.8.8.8'])
            ->get('/_test/client-ip', ['X-Forwarded-For' => '203.0.113.45'])
            ->assertOk()->assertJsonPath('ip', '8.8.8.8');
    }

    public function test_forwarded_proto_is_trusted(): void
    {
        $this->ipRoute();

        $this->get('/_test/client-ip', ['X-Forwarded-Proto' => 'https'])
            ->assertOk()->assertJsonPath('scheme', 'https');
    }

    /**
     * Regresión (incidente 2026-11-11): el nginx del host reenvía X-Forwarded-Host
     * VACÍO. Si se confía en ese header, Symfony Request::getPort() hace $host[0]
     * sobre '' → "Uninitialized string offset 0" → 500 en TODAS las rutas. Solo
     * confiamos en -For y -Proto, así que un -Host vacío debe ignorarse sin romper.
     */
    public function test_empty_forwarded_host_does_not_break_requests(): void
    {
        $this->ipRoute();

        $this->withServerVariables([
            'HTTP_X_FORWARDED_HOST' => '',
            'HTTP_X_FORWARDED_FOR' => '203.0.113.45',
            'HTTP_X_FORWARDED_PROTO' => 'https',
        ])->get('/_test/client-ip')
            ->assertOk()
            ->assertJsonPath('ip', '203.0.113.45')
            ->assertJsonPath('scheme', 'https');
    }
}
