<?php

declare(strict_types=1);

use App\Modules\Services\Http\Controllers\Portal\PortalServiceController;
use App\Modules\Services\Http\Controllers\ServiceController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Services (M-SRV, franja MVP) bajo /api/v1. Las transiciones
| exigen Idempotency-Key; suspender, reactivar y cancelar exigen motivo.
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('services', [ServiceController::class, 'index'])->middleware('permission:services.service.view')->name('services.index');
    Route::get('services/{id}', [ServiceController::class, 'show'])->whereUuid('id')->middleware('permission:services.service.view')->name('services.show');
    Route::post('services/{id}/activate', [ServiceController::class, 'activate'])->whereUuid('id')->middleware(['permission:services.service.update', 'idempotency'])->name('services.activate');
    Route::post('services/{id}/suspend', [ServiceController::class, 'suspend'])->whereUuid('id')->middleware(['permission:services.service.suspend', 'idempotency'])->name('services.suspend');
    Route::post('services/{id}/reactivate', [ServiceController::class, 'reactivate'])->whereUuid('id')->middleware(['permission:services.service.suspend', 'idempotency'])->name('services.reactivate');
    Route::post('services/{id}/cancel', [ServiceController::class, 'cancel'])->whereUuid('id')->middleware(['permission:services.service.delete', 'idempotency'])->name('services.cancel');
    Route::patch('services/{id}/access', [ServiceController::class, 'setAccess'])->whereUuid('id')->middleware('permission:services.service.update')->name('services.access');
});

Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('services', [PortalServiceController::class, 'index'])->middleware('permission:portal.service.view')->name('services.index');
    Route::get('services/{id}', [PortalServiceController::class, 'show'])->whereUuid('id')->middleware('permission:portal.service.view')->name('services.show');
});
