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
        Route::get('/_test/client-ip', fn (Request $r) => ['ip' => $r->ip()]);
    }

    public function test_forwarded_ip_is_trusted_from_the_proxy(): void
    {
        $this->ipRoute();

        // Petición desde el proxy confiable (loopback por defecto en tests) con XFF.
        $this->get('/_test/client-ip', ['X-Forwarded-For' => '203.0.113.45'])
            ->assertOk()->assertExactJson(['ip' => '203.0.113.45']);
    }

    public function test_forwarded_ip_is_ignored_from_an_untrusted_source(): void
    {
        $this->ipRoute();

        // Un origen NO confiable no puede falsear su IP vía X-Forwarded-For.
        $this->withServerVariables(['REMOTE_ADDR' => '8.8.8.8'])
            ->get('/_test/client-ip', ['X-Forwarded-For' => '203.0.113.45'])
            ->assertOk()->assertExactJson(['ip' => '8.8.8.8']);
    }
}
