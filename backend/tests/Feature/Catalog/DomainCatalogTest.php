<?php

declare(strict_types=1);

namespace Tests\Feature\Catalog;

use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class DomainCatalogTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $provider;

    private string $extension;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actingAs($this->admin);
        $this->provider = (string) Str::uuid();
        DB::table('providers')->insert([
            'id' => $this->provider, 'organization_id' => $this->admin->organization_id,
            'code' => 'domain-catalog-test', 'name' => 'Registrador de prueba', 'type' => 'registrar',
        ]);
        $this->extension = $this->postJson('/api/v1/admin/domain-extensions', [
            'tld' => 'test', 'default_registrar_id' => $this->provider,
        ])->assertCreated()->assertJsonPath('data.version', 1)->json('data.id');
    }

    public function test_it_manages_domain_extensions_and_prices(): void
    {
        $extensionsPath = '/api/v1/admin/domain-extensions';
        $this->getJson($extensionsPath)->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $this->extension);
        $this->patchJson("{$extensionsPath}/{$this->extension}", ['version' => 1, 'is_featured' => true])
            ->assertOk()->assertJsonPath('data.is_featured', true)->assertJsonPath('data.version', 2);
        $this->assertProblem($this->patchJson("{$extensionsPath}/{$this->extension}", ['version' => 1, 'is_active' => false]), 409, 'version_conflict');

        $pricesPath = '/api/v1/admin/domain-tld-prices';
        $payload = [
            'tld' => 'test', 'provider_id' => $this->provider, 'operation' => 'register', 'years' => 1,
            'cost_minor' => 100, 'cost_currency' => 'USD', 'price_minor' => 500, 'currency' => 'PEN',
            'effective_from' => '2030-01-01', 'domain_extension_id' => $this->extension,
        ];
        $this->postJson($pricesPath, $payload)->assertCreated()
            ->assertJsonPath('data.operation', 'register')->assertJsonPath('data.currency', 'PEN')
            ->assertJsonPath('data.effective_from', '2030-01-01')->assertJsonMissingPath('data.customers_notified_at');
        $this->assertProblem($this->postJson($pricesPath, $payload), 422, 'validation_failed');

        $invalidRange = $payload;
        $invalidRange['effective_from'] = '2030-02-01';
        $invalidRange['effective_to'] = '2030-02-01';
        $this->assertProblem($this->postJson($pricesPath, $invalidRange), 422, 'validation_failed');
    }
}
