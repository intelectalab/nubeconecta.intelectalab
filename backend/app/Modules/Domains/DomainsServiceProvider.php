<?php

declare(strict_types=1);

namespace App\Modules\Domains;

use App\Modules\Domains\Services\DomainService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class DomainsServiceProvider extends ServiceProvider
{
    public function register(): void { $this->app->scoped(DomainService::class); }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) { Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php'); }
    }
}
