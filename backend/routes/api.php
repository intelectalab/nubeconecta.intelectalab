<?php

use App\Http\Controllers\Api\V1\HealthController;
use Illuminate\Support\Facades\Route;

/*
| Rutas de la API (prefijo /api, registrado en bootstrap/app.php).
| Contrato: docs/06-api.md, bajo /api/v1/{admin,portal,public/wp,webhooks,auth}.
*/

Route::prefix('v1')->name('api.v1.')->group(function (): void {
    Route::get('health', HealthController::class)->middleware('throttle:60,1')->name('health');
});
