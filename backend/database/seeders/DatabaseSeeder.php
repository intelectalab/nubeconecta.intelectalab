<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Settings\Database\Seeders\SettingsSeeder;
use Illuminate\Database\Seeder;

/**
 * Seeders idempotentes de los módulos. No crea usuarios: el administrador
 * inicial se crea con `php artisan hub:create-admin <correo>`.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->call([IdentitySeeder::class, SettingsSeeder::class]);
    }
}
