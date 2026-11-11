<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Billing\Database\Seeders\BillingSeeder;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Sales\Database\Seeders\SalesSeeder;
use App\Modules\Settings\Database\Seeders\SettingsSeeder;
use Illuminate\Database\Seeder;

/**
 * Seeders idempotentes de los módulos. No crea usuarios: el administrador
 * inicial (superadmin) se crea con `php artisan hub:create-superadmin <correo>`.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([IdentitySeeder::class, SettingsSeeder::class, BillingSeeder::class, SalesSeeder::class, NotificationsSeeder::class]);
    }
}
