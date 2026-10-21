<?php

declare(strict_types=1);

namespace App\Modules\Settings;

use App\Modules\Settings\Services\BusinessCalendar;
use App\Modules\Settings\Services\SettingsCatalog;
use App\Modules\Settings\Services\SettingsResolver;
use App\Modules\Settings\Services\SettingsWriter;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\ServiceProvider;

/** Módulo Settings (M-CFG): centro de configuración, historial, feriados y horario. */
final class SettingsServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(SettingsCatalog::class);
        $this->app->scoped(SettingsResolver::class);
        $this->app->scoped(SettingsWriter::class);
        $this->app->scoped(BusinessCalendar::class);
    }

    public function boot(): void
    {
        if (! $this->app->routesAreCached()) {
            Route::middleware('api')->prefix('api/v1')->name('api.v1.')->group(__DIR__.'/routes/api.php');
        }
    }
}
