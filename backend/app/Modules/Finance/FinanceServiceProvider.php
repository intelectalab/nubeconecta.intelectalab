<?php

declare(strict_types=1);

namespace App\Modules\Finance;

use App\Modules\Finance\Services\CostAllocationService;
use App\Modules\Finance\Services\CostService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class FinanceServiceProvider extends ServiceProvider
{
    public function register(): void { $this->app->scoped(CostService::class); $this->app->scoped(CostAllocationService::class); }
    public function boot(): void { if (! $this->app->routesAreCached()) Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php'); }
}
