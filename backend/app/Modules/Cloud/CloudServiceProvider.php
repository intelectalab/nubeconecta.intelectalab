<?php

declare(strict_types=1);

namespace App\Modules\Cloud;

use App\Modules\Cloud\Services\CloudService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class CloudServiceProvider extends ServiceProvider
{
    public function register(): void { $this->app->scoped(CloudService::class); }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) { Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php'); }
    }
}
