<?php

declare(strict_types=1);

namespace App\Modules\Customers;

use App\Modules\Customers\Contracts\TaxIdLookup;
use App\Modules\Customers\Services\ConsentService;
use App\Modules\Customers\Services\CustomerImporter;
use App\Modules\Customers\Services\CustomerService;
use App\Modules\Customers\Services\MergeService;
use App\Modules\Customers\Services\PortalAccessService;
use App\Modules\Customers\Services\PrivacyService;
use App\Modules\Customers\Services\RelatedRecords;
use App\Modules\Customers\Support\NullTaxIdLookup;
use App\Shared\Contracts\CommunicationPreferences;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Customers (M-CUS): clientes, contactos, consentimientos, notas,
 * fusión, privacidad e importación. Interfaces públicas para otros módulos:
 * CustomerService::createFromLead (SAL) y CommunicationPreferences (SAL/AUT).
 */
final class CustomersServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(CustomerService::class);
        $this->app->scoped(ConsentService::class);
        $this->app->scoped(MergeService::class);
        $this->app->scoped(PrivacyService::class);
        $this->app->scoped(PortalAccessService::class);
        $this->app->scoped(CustomerImporter::class);
        $this->app->singleton(RelatedRecords::class);
        $this->app->bind(CommunicationPreferences::class, ConsentService::class);
        // Consulta externa de RUC/DNI (SUNAT/RENIEC): la doc no define conector; implementación nula.
        $this->app->bind(TaxIdLookup::class, NullTaxIdLookup::class);
    }

    public function boot(): void
    {
        // Baja pública por enlace: la doc no fija el límite; 30/min por IP.
        RateLimiter::for('customers-unsubscribe', fn (Request $request) => Limit::perMinute(30)->by((string) $request->ip()));

        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
