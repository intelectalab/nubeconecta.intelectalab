<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Cupones/promociones demo (globales, sin marca) para que el bloque público
 * `promocion` del widget embebible muestre ofertas vigentes.
 *
 * - Idempotente: si ya existe el cupón VERANO50, no hace nada.
 * - Transaccional. Ejecutar: php artisan db:seed --class=DemoCouponsSeeder
 */
final class DemoCouponsSeeder extends Seeder
{
    public function run(): void
    {
        $org = (string) DB::table('organizations')->value('id');
        if ($org === '') {
            $this->command?->warn('No hay organización; se omite DemoCouponsSeeder.');

            return;
        }
        if (DB::table('coupons')->where('organization_id', $org)->whereRaw('upper(code) = ?', ['VERANO50'])->exists()) {
            $this->command?->info('DemoCouponsSeeder: los cupones demo ya existen, no se hace nada.');

            return;
        }

        $now = now();
        $today = Carbon::now();
        // [code, type, percent|null, minor|null, currency|null, description, validDays]
        $coupons = [
            ['VERANO50', 'percent', 50, null, null, 'Primer mes de hosting al 50% para clientes nuevos.', 30],
            ['BIENVENIDA25', 'percent', 25, null, null, 'Descuento de bienvenida en cualquier plan anual.', 60],
            ['MIGRACERO', 'fixed', null, 15000, 'PEN', 'S/150 de descuento en migración y puesta en marcha.', 45],
            ['DOMINIO10', 'percent', 10, null, null, 'Descuento en el registro de tu dominio .pe o .com.', 20],
        ];

        DB::transaction(function () use ($org, $now, $today, $coupons): void {
            foreach ($coupons as [$code, $type, $percent, $minor, $currency, $desc, $days]) {
                DB::table('coupons')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'code' => $code,
                    'description' => $desc, 'discount_type' => $type,
                    'discount_percent' => $percent, 'discount_minor' => $minor, 'currency' => $currency,
                    'brand_id' => null, 'product_id' => null,
                    'valid_from' => $today->toDateString(), 'valid_until' => $today->copy()->addDays($days)->toDateString(),
                    'is_active' => true, 'is_public' => true, 'uses_count' => 0, 'version' => 1,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        });

        $this->command?->info('DemoCouponsSeeder: cupones/promociones demo creados.');
    }
}
