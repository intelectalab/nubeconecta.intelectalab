<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

/** Endpoint público y anónimo del branding del login (un solo login global). */
final class PublicLoginBrandingTest extends IdentityTestCase
{
    public function test_returns_default_branding_without_authentication(): void
    {
        $this->getJson('/api/v1/public/login-branding')
            ->assertOk()
            ->assertHeader('Cache-Control', 'max-age=300, public')
            ->assertJsonPath('data.brand_name', 'NubeConecta')
            ->assertJsonPath('data.hero_title', 'Tu infraestructura en la nube, dominios y finanzas bajo control')
            ->assertJsonPath('data.logo_url', null)
            ->assertJsonCount(3, 'data.bullets')
            ->assertJsonPath('data.bullets.0.icon', 'shield')
            ->assertJsonPath('data.colors.accent', null);
    }

    public function test_returns_custom_branding_when_configured(): void
    {
        $this->setSetting('portal.login_branding', [
            'brand_name' => 'Acme Cloud',
            'logo_url' => 'https://cdn.acme.test/logo.svg',
            'hero_title' => 'Bienvenido a Acme',
            'bullets' => [
                ['icon' => 'server', 'title' => 'Servidores', 'text' => 'Alta disponibilidad.'],
            ],
            'colors' => ['bg_from' => '#102030', 'accent' => '#5F9A32'],
        ]);

        $this->getJson('/api/v1/public/login-branding')
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'Acme Cloud')
            ->assertJsonPath('data.logo_url', 'https://cdn.acme.test/logo.svg')
            ->assertJsonPath('data.hero_title', 'Bienvenido a Acme')
            ->assertJsonCount(1, 'data.bullets')
            ->assertJsonPath('data.bullets.0.icon', 'server')
            ->assertJsonPath('data.colors.bg_from', '#102030')
            ->assertJsonPath('data.colors.accent', '#5f9a32')
            // Un campo no provisto cae al valor por defecto, no desaparece.
            ->assertJsonPath('data.footer_line2', 'Soporte NOC: guardia@alojamientoplus.pe');
    }

    public function test_sanitizes_hostile_input(): void
    {
        $this->setSetting('portal.login_branding', [
            'brand_name' => '<script>alert(1)</script>Malvado',
            'logo_url' => 'javascript:alert(document.cookie)',
            'hero_title' => '<img src=x onerror=alert(1)>Hola',
            'bullets' => [
                ['icon' => 'javascript', 'title' => 'Ícono inválido', 'text' => '<b>negrita</b> peligro'],
                ['icon' => 'shield', 'title' => '', 'text' => 'sin título → se descarta'],
            ],
            'colors' => ['bg_from' => 'red; background:url(//evil)', 'accent' => '#xyzxyz'],
        ]);

        $res = $this->getJson('/api/v1/public/login-branding')->assertOk();

        $res->assertJsonPath('data.brand_name', 'Malvado'); // etiquetas removidas
        $res->assertJsonPath('data.logo_url', null);        // esquema no http(s) → descartado
        $res->assertJsonPath('data.hero_title', 'Hola');
        $res->assertJsonCount(1, 'data.bullets');           // el bullet sin título se descarta
        $res->assertJsonPath('data.bullets.0.icon', 'shield'); // ícono inválido → shield
        $res->assertJsonPath('data.bullets.0.text', 'negrita peligro');
        $res->assertJsonPath('data.colors.bg_from', null);  // no es #rrggbb
        $res->assertJsonPath('data.colors.accent', null);

        // El contenido entregado no contiene marcado peligroso.
        $this->assertStringNotContainsString('<script', (string) $res->getContent());
        $this->assertStringNotContainsString('javascript:', (string) $res->getContent());
        $this->assertStringNotContainsString('onerror', (string) $res->getContent());
    }
}
