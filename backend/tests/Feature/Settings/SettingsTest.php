<?php

declare(strict_types=1);

namespace Tests\Feature\Settings;

use App\Modules\Settings\Database\Seeders\SettingsSeeder;
use App\Modules\Settings\Services\BusinessCalendar;
use App\Modules\Settings\Services\SettingsCatalog;
use Carbon\CarbonImmutable;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

final class SettingsTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private function admin(): void
    {
        $this->actingAs($this->makeUser(['admin'], mfa: true));
    }

    public function test_seeder_loads_catalog_defaults_without_inventing_and_is_idempotent(): void
    {
        $catalog = app(SettingsCatalog::class)->all();
        $expected = array_filter($catalog, fn (array $d): bool => ! $d['requires_definition'] && ($d['default'] ?? null) !== null);
        $this->seed(SettingsSeeder::class);

        $stored = DB::table('settings')->where('scope_type', 'global')->pluck('value', 'key');
        $this->assertCount(count($expected), $stored);
        foreach ($expected as $key => $definition) {
            $this->assertEquals($definition['default'], json_decode((string) $stored[$key], true), $key);
        }
        foreach ($catalog as $key => $definition) {
            if ($definition['requires_definition']) {
                $this->assertFalse($stored->has($key), "{$key} requiere definición y no debe tener valor inventado");
            }
        }

        $this->admin();
        $list = $this->getJson('/api/v1/admin/settings')->assertOk();
        $this->assertCount(count($catalog), $list->json('data'));
        $this->getJson('/api/v1/admin/settings/billing.invoice_consolidation')->assertOk()
            ->assertJsonPath('data.effective.source', 'undefined')
            ->assertJsonPath('data.requires_definition', true);
    }

    public function test_most_specific_level_wins_and_reports_origin(): void
    {
        $org = DB::table('organizations')->value('id');
        [$brand, $customer, $contract] = [(string) Str::uuid(), (string) Str::uuid(), (string) Str::uuid()];
        DB::table('settings')->where('key', 'billing.invoice_generation_days')->update(['value' => '30']);
        foreach (['brand' => [$brand, 20], 'customer' => [$customer, 10]] as $scope => [$id, $value]) {
            DB::table('settings')->insert(['organization_id' => $org, 'key' => 'billing.invoice_generation_days', 'scope_type' => $scope, 'scope_id' => $id, 'value' => json_encode($value)]);
        }

        $this->admin();
        $this->getJson("/api/v1/admin/settings/billing.invoice_generation_days/resolve?brand_id={$brand}&customer_id={$customer}&contract_id={$contract}")
            ->assertOk()->assertJsonPath('data.value', 10)->assertJsonPath('data.source', 'customer');
        $this->getJson("/api/v1/admin/settings/billing.invoice_generation_days/resolve?brand_id={$brand}")
            ->assertJsonPath('data.value', 20)->assertJsonPath('data.source', 'brand');
        $this->getJson('/api/v1/admin/settings/billing.invoice_generation_days/resolve')
            ->assertJsonPath('data.value', 30)->assertJsonPath('data.source', 'global');
    }

    public function test_put_validates_and_revert_restores_previous_value_with_history(): void
    {
        $this->admin();
        $url = '/api/v1/admin/settings/billing.invoice_generation_days';

        $this->assertProblem($this->putJson($url, ['scope_type' => 'global', 'value' => 25]), 422, 'validation_failed'); // falta version
        $this->assertProblem($this->putJson($url, ['scope_type' => 'global', 'value' => 25, 'version' => 7]), 409, 'version_conflict');
        $this->assertProblem($this->putJson($url, ['scope_type' => 'global', 'value' => 'treinta', 'version' => 1]), 422, 'validation_failed');
        $this->assertProblem($this->putJson('/api/v1/admin/settings/billing.invoice_consolidation', ['scope_type' => 'brand', 'scope_id' => (string) Str::uuid(), 'value' => 'consolidated']), 422, 'validation_failed');
        $this->assertProblem($this->putJson('/api/v1/admin/settings/no.existe', ['scope_type' => 'global', 'value' => 1]), 404, 'not_found');

        $change = $this->putJson($url, ['scope_type' => 'global', 'value' => 25, 'version' => 1, 'reason' => 'prueba'])
            ->assertOk()->assertJsonPath('data.value', 25)->assertJsonPath('data.version', 2)->json('data.change_id');
        $this->assertDatabaseHas('setting_changes', ['id' => $change, 'key' => 'billing.invoice_generation_days', 'reason' => 'prueba']);
        $this->assertDatabaseHas('audit_events', ['action' => 'setting.changed', 'entity_type' => 'setting']);

        $revert = $this->postJson("/api/v1/admin/setting-changes/{$change}/revert")->assertCreated();
        $this->assertSame($change, $revert->json('data.reverts_change_id'));
        $this->getJson("{$url}/resolve")->assertJsonPath('data.value', 30);
        $this->assertSame(2, DB::table('setting_changes')->where('key', 'billing.invoice_generation_days')->count());
        $this->getJson('/api/v1/admin/setting-changes?filter[key]=billing.invoice_generation_days')->assertOk()->assertJsonCount(2, 'data');
        $this->assertNull(app(\App\Shared\Audit\AuditLogger::class)->verify());
    }

    public function test_finance_edits_dunning_settings_but_not_general_ones(): void
    {
        $this->actingAs($this->makeUser(['finance'], mfa: true));

        $this->putJson('/api/v1/admin/settings/services.suspension.days_after_due', ['scope_type' => 'global', 'value' => 2, 'version' => 1])
            ->assertOk()->assertJsonPath('data.value', 2);
        $this->assertProblem($this->putJson('/api/v1/admin/settings/security.session_duration_hours', ['scope_type' => 'global', 'value' => 4, 'version' => 1]), 403, 'forbidden');
    }

    public function test_holidays_business_hours_and_business_calendar(): void
    {
        $this->admin();

        $this->getJson('/api/v1/admin/business-hours')->assertOk()->assertJsonPath('data.version', 0);
        $week = array_map(fn (int $d): array => ['weekday' => $d, 'opens_at' => '09:00', 'closes_at' => '18:00'], range(1, 5));
        $this->assertProblem($this->putJson('/api/v1/admin/business-hours', ['version' => 0, 'timezone' => 'America/Lima', 'intervals' => [...$week, ['weekday' => 1, 'opens_at' => '17:00', 'closes_at' => '19:00']]]), 422, 'validation_failed');
        $this->putJson('/api/v1/admin/business-hours', ['version' => 0, 'timezone' => 'America/Lima', 'intervals' => $week])
            ->assertOk()->assertJsonPath('data.version', 1)->assertJsonCount(5, 'data.intervals');
        $this->assertProblem($this->putJson('/api/v1/admin/business-hours', ['version' => 0, 'timezone' => 'America/Lima', 'intervals' => $week]), 409, 'version_conflict');

        // Viernes 2026-07-24 feriado de prueba: el siguiente día hábil es el lunes 27.
        $holiday = $this->postJson('/api/v1/admin/holidays', ['date' => '2026-07-24', 'name' => 'Feriado de prueba'])->assertCreated()->json('data');
        $this->assertSame('PE', $holiday['country']);
        $this->assertProblem($this->postJson('/api/v1/admin/holidays', ['date' => '2026-07-24', 'name' => 'Duplicado']), 409, 'conflict');
        $this->patchJson("/api/v1/admin/holidays/{$holiday['id']}", ['version' => 1, 'recurring' => true])->assertOk()->assertJsonPath('data.version', 2);
        $this->getJson('/api/v1/admin/holidays?filter[year]=2027')->assertOk()->assertJsonCount(1, 'data');

        $calendar = app(BusinessCalendar::class);
        $this->assertSame('2026-07-27', $calendar->nextBusinessDay(CarbonImmutable::parse('2026-07-24'))->toDateString());
        $this->assertSame('2027-07-26', $calendar->nextBusinessDay(CarbonImmutable::parse('2027-07-24'))->toDateString()); // recurrente, sábado → lunes
        $this->assertSame('2026-07-28', $calendar->addBusinessDays(CarbonImmutable::parse('2026-07-23'), 2)->toDateString());
        $this->assertTrue($calendar->isOpenAt(CarbonImmutable::parse('2026-07-23 15:00:00', 'UTC'))); // 10:00 en Lima
        $this->assertFalse($calendar->isOpenAt(CarbonImmutable::parse('2026-07-23 23:30:00', 'UTC'))); // 18:30 en Lima
    }
}
