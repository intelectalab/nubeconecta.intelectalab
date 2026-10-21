<?php

return [
    App\Providers\AppServiceProvider::class,
    App\Providers\HorizonServiceProvider::class,
    App\Shared\SharedServiceProvider::class,
    // Módulos (app/Modules/<Modulo>/<Modulo>ServiceProvider.php): cada uno carga sus rutas.
    App\Modules\Identity\IdentityServiceProvider::class,
    App\Modules\Settings\SettingsServiceProvider::class,
    App\Modules\Brands\BrandsServiceProvider::class,
];
