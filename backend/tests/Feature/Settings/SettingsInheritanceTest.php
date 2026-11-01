<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class SettingsInheritanceTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    public function test_specific_contract_setting_overrides_each_parent_and_removing_it_restores_inheritance(): void
    {
        $organization = DB::table('organizations')->value('id');
        $ids = [
            'brand' => (string) Str::uuid(),
            'product' => (string) Str::uuid(),
            'customer' => (string) Str::uuid(),
            'contract' => (string) Str::uuid(),
        ];
        $key = 'billing.invoice_generation_days';
        $values = ['global' => 30, 'brand' => 20, 'product' => 15, 'customer' => 10, 'contract' => 5];

        foreach ($values as $scope => $value) {
            DB::table('settings')->updateOrInsert(
                [
                    'organization_id' => $organization,
                    'key' => $key,
                    'scope_type' => $scope,
                    'scope_id' => $ids[$scope] ?? null,
                ],
                ['value' => json_encode($value)],
            );
        }

        $this->actingAs($this->makeUser(['admin'], mfa: true));
        $url = "/api/v1/admin/settings/{$key}/resolve?brand_id={$ids['brand']}&product_id={$ids['product']}&customer_id={$ids['customer']}&contract_id={$ids['contract']}";

        $this->getJson($url)->assertOk()->assertJsonPath('data.value', 5)->assertJsonPath('data.source', 'contract');
        foreach ([['contract', 10, 'customer'], ['customer', 15, 'product'], ['product', 20, 'brand'], ['brand', 30, 'global']] as [$scope, $expectedValue, $expectedSource]) {
            $response = $this->deleteJson("/api/v1/admin/settings/{$key}", [
                'scope_type' => $scope,
                'scope_id' => $ids[$scope],
                'version' => 1,
            ])->assertOk()->assertJsonStructure(['data' => ['change_id']]);

            $this->getJson($url)->assertOk()->assertJsonPath('data.value', $expectedValue)->assertJsonPath('data.source', $expectedSource);
            $this->assertDatabaseHas('setting_changes', [
                'id' => $response->json('data.change_id'),
                'key' => $key,
                'scope_type' => $scope,
            ]);
        }
    }

    public function test_writing_setting_requires_the_key_edit_permission_and_records_the_change(): void
    {
        $key = 'billing.invoice_generation_days';
        $url = "/api/v1/admin/settings/{$key}";

        $this->actingAs($this->makeUser(['sales'], mfa: true));
        $this->putJson($url, ['scope_type' => 'global', 'value' => 25, 'version' => 1])
            ->assertStatus(403)->assertJsonPath('code', 'forbidden');

        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($this->makeUser(['admin'], mfa: true));
        $changeId = $this->putJson($url, ['scope_type' => 'global', 'value' => 25, 'version' => 1, 'reason' => 'prueba de permiso'])
            ->assertOk()->assertJsonPath('data.value', 25)->assertJsonPath('data.source', 'global')
            ->json('data.change_id');

        $this->assertDatabaseHas('setting_changes', [
            'id' => $changeId,
            'key' => $key,
            'scope_type' => 'global',
            'new_value' => '25',
            'reason' => 'prueba de permiso',
        ]);
    }
}
