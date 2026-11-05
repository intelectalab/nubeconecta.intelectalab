<?php

declare(strict_types=1);

namespace App\Modules\Monitoring;

use App\Modules\Monitoring\Services\IncidentService;
use App\Modules\Monitoring\Services\MonitorService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class MonitoringServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(MonitorService::class);
        $this->app->scoped(IncidentService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
    }
}
