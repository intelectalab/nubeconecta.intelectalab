<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Identity\Models\Organization;
use App\Modules\Tenancy\Models\SaasPlan;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;

/**
 * Planes SaaS por defecto de la organización operadora (multitenancy Fase 1).
 * Idempotente (por `code`). Fuera de DatabaseSeeder: se corre a mano en dev
 * (`php artisan db:seed --class=Database\\Seeders\\SaasPlanSeeder`).
 */
final class SaasPlanSeeder extends Seeder
{
    public function run(): void
    {
        $operator = Organization::query()->where('is_operator', true)->orderBy('created_at')->first()
            ?? Organization::ensureDefault();
        app(CurrentOrganization::class)->set($operator->id);

        $plans = [
            ['code' => 'basico', 'name' => 'Básico', 'price_minor' => 9900, 'currency' => 'PEN', 'max_staff_users' => 5, 'max_customers' => 100, 'max_services' => 200],
            ['code' => 'pro', 'name' => 'Pro', 'price_minor' => 24900, 'currency' => 'PEN', 'max_staff_users' => 20, 'max_customers' => 1000, 'max_services' => 2000],
            ['code' => 'ilimitado', 'name' => 'Ilimitado', 'price_minor' => 49900, 'currency' => 'PEN', 'max_staff_users' => null, 'max_customers' => null, 'max_services' => null],
        ];

        foreach ($plans as $plan) {
            SaasPlan::query()->updateOrCreate(['code' => $plan['code']], $plan);
        }
    }
}
