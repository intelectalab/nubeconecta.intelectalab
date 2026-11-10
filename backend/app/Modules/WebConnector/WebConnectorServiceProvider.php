<?php

declare(strict_types=1);

namespace App\Modules\WebConnector;

use App\Modules\Brands\Events\BrandThemeVersionPublished;
use App\Modules\Brands\Events\BrandThemeVersionReverted;
use App\Modules\Brands\Events\BrandUpdated;
use App\Modules\Catalog\Events\PlanChanged;
use App\Modules\Catalog\Events\PlanPriceChanged;
use App\Modules\WebConnector\Console\DemoWebCommand;
use App\Modules\WebConnector\Contracts\CaptchaVerifier;
use App\Modules\WebConnector\Contracts\DomainAvailabilityChecker;
use App\Modules\WebConnector\Contracts\WhoisClient;
use App\Modules\WebConnector\Services\Domains\PublicDomainAvailabilityChecker;
use App\Modules\WebConnector\Services\Domains\SocketWhoisClient;
use App\Modules\WebConnector\Http\Middleware\AuthenticateWpSite;
use App\Modules\WebConnector\Listeners\InvalidateBrandSites;
use App\Modules\WebConnector\Listeners\InvalidateCatalogSites;
use App\Modules\WebConnector\Services\CacheInvalidator;
use App\Modules\WebConnector\Services\NullCaptchaVerifier;
use App\Modules\WebConnector\Services\SecretStore;
use App\Modules\WebConnector\Services\WebhookSigner;
use App\Modules\WebConnector\Services\WpSiteService;
use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Foundation\Console\AboutCommand;
use Illuminate\Http\Request;
use Illuminate\Routing\Router;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/** Módulo WebConnector (M-WCN): sitios WordPress, tokens del plugin, avisos de invalidación y API /public/wp. */
final class WebConnectorServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SecretStore::class);
        $this->app->singleton(WebhookSigner::class);
        $this->app->scoped(CacheInvalidator::class);
        $this->app->scoped(WpSiteService::class);
        // D-24: proveedor de captcha sin decidir; este enlace se reemplaza cuando se elija.
        $this->app->singleton(CaptchaVerifier::class, NullCaptchaVerifier::class);
        // D-35: disponibilidad con RDAP/WHOIS públicos; se reemplaza por la API de un registrador.
        $this->app->bind(WhoisClient::class, SocketWhoisClient::class);
        $this->app->bind(DomainAvailabilityChecker::class, PublicDomainAvailabilityChecker::class);
    }

    public function boot(Router $router): void
    {
        $router->aliasMiddleware('wp.site', AuthenticateWpSite::class);

        // Límite por token del sitio; la doc no fija el valor (config hub.web_connector).
        RateLimiter::for('wp-plugin', function (Request $request): Limit {
            if ($request->attributes->get('wp_site_token_scope') === 'embed') {
                $site = $request->attributes->get('wp_site');
                $ipHash = hash_hmac('sha256', (string) $request->ip(), (string) config('app.key'));

                return Limit::perMinute(max(1, app(\App\Shared\Settings\SettingsReader::class)->int('web_connector.embed.requests_per_minute', 120)))
                    ->by('wcn-embed:'.$site->organization_id.':'.$site->id.':'.$ipHash);
            }

            return Limit::perMinute((int) config('hub.web_connector.requests_per_minute', 120))
                ->by('wp:'.($request->attributes->get('wp_site_token_id') ?? $request->ip()));
        });

        Event::listen([BrandUpdated::class, BrandThemeVersionPublished::class, BrandThemeVersionReverted::class], InvalidateBrandSites::class);
        Event::listen([PlanChanged::class, PlanPriceChanged::class], InvalidateCatalogSites::class);

        AboutCommand::add('Hub', fn () => [
            'Vault key' => (static function (): string {
                $key = config('hub.vault.key');

                if ($key === null || $key === '') {
                    return 'derivada de APP_KEY (no apta para producción)';
                }

                $decoded = is_string($key) ? base64_decode($key, true) : false;

                return $decoded !== false && strlen($decoded) === 32
                    ? 'configurada'
                    : 'invalida (no es base64 de 32 bytes)';
            })(),
        ]);

        if ($this->app->runningInConsole()) {
            $this->commands([DemoWebCommand::class]);
        }

        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
