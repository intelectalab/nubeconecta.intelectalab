<?php

declare(strict_types=1);

use App\Modules\Vault\Http\Controllers\OneTimeLinkController;
use App\Modules\Vault\Http\Controllers\PublicOneTimeLinkController;
use App\Modules\Vault\Http\Controllers\SecretAccessLogController;
use App\Modules\Vault\Http\Controllers\SecretController;
use App\Modules\Vault\Http\Controllers\SecretGrantController;
use Illuminate\Support\Facades\Route;

/**
 * Bóveda (M-VLT): accesos cifrados, concesiones y bitácora. Revelar exige
 * `vault.secret.reveal` + MFA reciente (mfa.recent) + concesión vigente (en el
 * servicio). El valor solo sale por `reveal`, nunca en listado/vista.
 */
Route::prefix('admin/vault')->name('admin.vault.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('secrets', [SecretController::class, 'index'])->middleware('permission:vault.secret.view')->name('secrets.index');
    Route::post('secrets', [SecretController::class, 'store'])->middleware(['permission:vault.secret.create', 'idempotency:optional'])->name('secrets.store');
    Route::get('secrets/{id}', [SecretController::class, 'show'])->whereUuid('id')->middleware('permission:vault.secret.view')->name('secrets.show');
    Route::patch('secrets/{id}', [SecretController::class, 'update'])->whereUuid('id')->middleware('permission:vault.secret.update')->name('secrets.update');
    Route::delete('secrets/{id}', [SecretController::class, 'destroy'])->whereUuid('id')->middleware('permission:vault.secret.delete')->name('secrets.destroy');
    Route::post('secrets/{id}/reveal', [SecretController::class, 'reveal'])->whereUuid('id')->middleware(['permission:vault.secret.reveal', 'mfa.recent'])->name('secrets.reveal');

    Route::get('secrets/{id}/grants', [SecretGrantController::class, 'index'])->whereUuid('id')->middleware('permission:vault.secret_grant.view')->name('grants.index');
    Route::post('secrets/{id}/grants', [SecretGrantController::class, 'store'])->whereUuid('id')->middleware('permission:vault.secret_grant.create')->name('grants.store');
    Route::delete('secrets/{id}/grants/{grant}', [SecretGrantController::class, 'destroy'])->whereUuid('id')->whereUuid('grant')->middleware('permission:vault.secret_grant.delete')->name('grants.destroy');

    Route::get('secrets/{id}/access-logs', [SecretAccessLogController::class, 'index'])->whereUuid('id')->middleware('permission:vault.secret_access_log.view')->name('logs.index');

    Route::get('one-time-links', [OneTimeLinkController::class, 'index'])->middleware('permission:vault.one_time_link.view')->name('otl.index');
    Route::post('one-time-links', [OneTimeLinkController::class, 'store'])->middleware(['permission:vault.one_time_link.create', 'mfa.recent'])->name('otl.store');
    Route::delete('one-time-links/{id}', [OneTimeLinkController::class, 'destroy'])->whereUuid('id')->middleware('permission:vault.one_time_link.delete')->name('otl.destroy');
});

// Consumo público del enlace de un solo uso (sin sesión; el token es la credencial).
Route::prefix('public/vault')->name('public.vault.')->group(function (): void {
    Route::post('one-time/{token}', [PublicOneTimeLinkController::class, 'consume'])->where('token', '[a-f0-9]{64}')->name('one-time.consume');
});
