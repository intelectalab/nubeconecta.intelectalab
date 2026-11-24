<?php

declare(strict_types=1);

namespace App\Modules\Vault;

use App\Modules\Vault\Services\VaultCipher;
use App\Modules\Vault\Services\VaultService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class VaultServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(VaultCipher::class);
        $this->app->scoped(VaultService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
