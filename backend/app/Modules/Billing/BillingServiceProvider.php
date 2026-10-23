<?php

declare(strict_types=1);

namespace App\Modules\Billing;

use App\Modules\Billing\Connectors\FakeEInvoiceConnector;
use App\Modules\Billing\Connectors\MercadoPagoConnector;
use App\Modules\Billing\Connectors\UnconfiguredEInvoiceConnector;
use App\Modules\Billing\Console\GenerateRenewalsCommand;
use App\Modules\Billing\Console\RunDunningCommand;
use App\Modules\Billing\Contracts\CardGatewayConnector;
use App\Modules\Billing\Contracts\EInvoiceConnector;
use App\Modules\Billing\Listeners\DraftInvoiceFromOrder;
use App\Modules\Billing\Services\CardPaymentService;
use App\Modules\Billing\Services\CollectionsService;
use App\Modules\Billing\Services\InvoiceService;
use App\Modules\Billing\Services\PaymentService;
use App\Modules\Billing\Services\ProofStorage;
use App\Modules\Orders\Events\OrderApproved;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/**
 * Módulo Billing (M-BIL, franja MVP): factura/boleta inicial al aprobar el
 * pedido, emisión con series de BRD, envío al conector electrónico (simulado
 * mientras no se elija el OSE/PSE, D-01), representación imprimible,
 * renovaciones y anulación; pagos (manuales y vouchers del portal) con
 * aplicación a comprobantes, anulación, antigüedad de deuda y avisos de cobranza.
 * Pasarela de tarjetas (D-18): Mercado Pago Checkout Pro (CardPaymentService +
 * Connectors/MercadoPagoConnector), activa solo con MP_ACCESS_TOKEN y MP_WEBHOOK_SECRET.
 */
final class BillingServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(InvoiceService::class);
        $this->app->scoped(PaymentService::class);
        $this->app->scoped(CollectionsService::class);
        $this->app->scoped(ProofStorage::class);
        $this->app->scoped(CardPaymentService::class);
        $this->app->bind(CardGatewayConnector::class, fn (): CardGatewayConnector => MercadoPagoConnector::fromConfig());
        $this->app->bind(EInvoiceConnector::class, function (): EInvoiceConnector {
            $driver = (string) config('hub.billing.einvoice.driver', 'fake');

            return $driver === 'fake' ? new FakeEInvoiceConnector : new UnconfiguredEInvoiceConnector($driver);
        });
    }

    public function boot(): void
    {
        Event::listen(OrderApproved::class, DraftInvoiceFromOrder::class);
        RateLimiter::for('card-webhooks', fn (Request $request) => Limit::perMinute(120)->by((string) $request->ip()));
        RateLimiter::for('card-confirm', fn (Request $request) => Limit::perMinute(30)->by((string) ($request->user()?->getAuthIdentifier() ?? $request->ip())));
        $this->loadViewsFrom(__DIR__.'/resources/views', 'billing');

        if ($this->app->runningInConsole()) {
            $this->commands([GenerateRenewalsCommand::class, RunDunningCommand::class]);
        }
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
