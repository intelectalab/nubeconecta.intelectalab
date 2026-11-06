<?php

declare(strict_types=1);

namespace App\Modules\Notifications;

use App\Modules\Notifications\Services\NotificationService;
use App\Modules\Notifications\Services\NotificationTemplateService;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

final class NotificationsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->scoped(NotificationService::class);
        $this->app->scoped(NotificationTemplateService::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
    }
}
