<?php

declare(strict_types=1);

namespace App\Shared;

use App\Shared\Audit\AuditLogger;
use App\Shared\Console\VerifyAuditChainCommand;
use App\Shared\Organization\CurrentOrganization;
use App\Shared\Settings\SettingsReader;
use Illuminate\Support\ServiceProvider;

/** Servicios transversales (app/Shared) que usan todos los módulos. */
final class SharedServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        // scoped: se reinician en cada petición/job (Octane, Horizon).
        $this->app->scoped(CurrentOrganization::class);
        $this->app->scoped(SettingsReader::class);
        $this->app->scoped(AuditLogger::class);
    }

    public function boot(): void
    {
        if ($this->app->runningInConsole()) {
            $this->commands([VerifyAuditChainCommand::class]);
        }
    }
}
