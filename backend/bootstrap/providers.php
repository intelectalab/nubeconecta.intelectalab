<?php

return [
    App\Providers\AppServiceProvider::class,
    App\Providers\HorizonServiceProvider::class,
    App\Shared\SharedServiceProvider::class,
    // Módulos (app/Modules/<Modulo>/<Modulo>ServiceProvider.php): cada uno carga sus rutas.
    App\Modules\Identity\IdentityServiceProvider::class,
    App\Modules\Settings\SettingsServiceProvider::class,
    App\Modules\Brands\BrandsServiceProvider::class,
    App\Modules\WebConnector\WebConnectorServiceProvider::class,
    App\Modules\Customers\CustomersServiceProvider::class,
    App\Modules\Providers\ProvidersServiceProvider::class,
    App\Modules\Catalog\CatalogServiceProvider::class,
    App\Modules\Support\SupportServiceProvider::class,
    App\Modules\Orders\OrdersServiceProvider::class,
    // Services antes que Billing: ambos escuchan OrderApproved y la factura inicial enlaza los servicios.
    App\Modules\Services\ServicesServiceProvider::class,
    App\Modules\Sales\SalesServiceProvider::class,
    App\Modules\Contracts\ContractsServiceProvider::class,
    App\Modules\Billing\BillingServiceProvider::class,
    App\Modules\Work\WorkServiceProvider::class,
    App\Modules\Monitoring\MonitoringServiceProvider::class,
];
