<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Poda diaria de tokens Sanctum vencidos (sanctum.expiration o expires_at) con 24 h de gracia.
Schedule::command('sanctum:prune-expired --hours=24')->daily()->onOneServer()->withoutOverlapping();

// Privacidad de Customers: elimina diariamente exportaciones cifradas vencidas.
Schedule::command('hub:privacy:purge-exports')->daily()->onOneServer()->withoutOverlapping();

// Billing (M-BIL §9): borradores de renovación de los servicios que vencen (RN-BIL-001), cola `billing`.
Schedule::job(new App\Modules\Billing\Jobs\GenerateRenewalInvoices, 'billing')->dailyAt('06:00')->onOneServer()->withoutOverlapping();

// Cobranza (M-BIL §9): vencidos y avisos de la secuencia (RN-BIL-031), sin recargo por mora (D-04).
Schedule::job(new App\Modules\Billing\Jobs\RunDunningSequence, 'billing')->dailyAt('07:00')->onOneServer()->withoutOverlapping();
