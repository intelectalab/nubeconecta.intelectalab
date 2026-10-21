<?php

declare(strict_types=1);

namespace App\Modules\Settings\Database\Seeders;

use App\Modules\Settings\Services\SettingsCatalog;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

/**
 * Carga el valor general (scope_type = global) de cada ajuste del catálogo
 * database/seeds/settings.json. Idempotente y conservador:
 *  - solo inserta claves que aún no tienen valor general: nunca pisa lo que
 *    el administrador cambió;
 *  - no inserta las claves con `requires_definition: true` ni las que no
 *    tienen valor por defecto: quedan sin valor (origen `undefined`) hasta
 *    que el negocio las defina (docs/11). No se inventan valores.
 * No crea feriados ni horario de atención: también los define el negocio.
 * Requiere la organización (corre después de IdentitySeeder).
 */
final class SettingsSeeder extends Seeder
{
    public function run(): void
    {
        SettingsCatalog::flush();
        $catalog = app(SettingsCatalog::class);
        $organizationId = app(CurrentOrganization::class)->id();

        $existing = DB::table('settings')->where('organization_id', $organizationId)->where('scope_type', 'global')->pluck('key')->flip();
        $rows = [];
        foreach ($catalog->all() as $key => $definition) {
            if ($definition['requires_definition'] || ! array_key_exists('default', $definition) || $definition['default'] === null || $existing->has($key)) {
                continue;
            }
            $rows[] = [
                'organization_id' => $organizationId,
                'key' => $key,
                'scope_type' => 'global',
                'scope_id' => null,
                'value' => json_encode($definition['default'], JSON_THROW_ON_ERROR | JSON_PRESERVE_ZERO_FRACTION),
            ];
        }

        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('settings')->insertOrIgnore($chunk);
        }
    }
}
