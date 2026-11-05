<?php

declare(strict_types=1);

namespace App\Modules\Inventory;

use App\Modules\Inventory\Services\HostingAccountService;
use App\Modules\Inventory\Services\HostingNodeService;
use App\Modules\Inventory\Services\ResourceService;
use App\Modules\Inventory\Services\ServerService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class InventoryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(ResourceService::class);
        $this->app->scoped(ServerService::class);
        $this->app->scoped(HostingNodeService::class);
        $this->app->scoped(HostingAccountService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
    }
}
