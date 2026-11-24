<?php

declare(strict_types=1);

namespace Tests\Feature\Identity;

use App\Modules\Identity\Models\Organization;
use Illuminate\Support\Facades\DB;

/**
 * Multitenancy Fase 2: el host `<subdominio>.<base>` resuelve la organización
 * antes del login, de modo que el branding del acceso es el del inquilino.
 */
final class TenantHostBrandingTest extends IdentityTestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        config(['hub.tenancy.base_domain' => 'hub.test']);
    }

    public function test_tenant_subdomain_host_serves_tenant_branding(): void
    {
        $orgB = Organization::query()->create(['name' => 'Hosting B', 'slug' => 'hosting-b', 'subdomain' => 'hostingb', 'country' => 'PE']);
        DB::table('settings')->updateOrInsert(
            ['organization_id' => $orgB->id, 'key' => 'portal.login_branding', 'scope_type' => 'global', 'scope_id' => null],
            ['value' => json_encode(['brand_name' => 'Hosting B'])],
        );

        // URL absoluta: así el host de la petición es el del subdominio del inquilino.
        $this->getJson('http://hostingb.hub.test/api/v1/public/login-branding')
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'Hosting B');
    }

    public function test_base_domain_host_serves_operator_default_branding(): void
    {
        // Sin subdominio (dominio base) → organización operadora: branding por defecto.
        $this->getJson('http://hub.test/api/v1/public/login-branding')
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'NubeConecta');
    }

    public function test_unknown_subdomain_falls_back_to_operator(): void
    {
        $this->getJson('http://noexiste.hub.test/api/v1/public/login-branding')
            ->assertOk()
            ->assertJsonPath('data.brand_name', 'NubeConecta');
    }
}
