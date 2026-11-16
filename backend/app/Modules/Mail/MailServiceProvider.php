<?php

declare(strict_types=1);

namespace App\Modules\Mail;

use App\Modules\Mail\Services\MailService;
use App\Modules\Mail\Services\SslCertificateService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class MailServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(MailManager::class);
        $this->app->scoped(SslCertificateService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) { Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php'); }
    }
}
