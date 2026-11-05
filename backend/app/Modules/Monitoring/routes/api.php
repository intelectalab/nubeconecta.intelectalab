<?php

declare(strict_types=1);

use App\Modules\Monitoring\Http\Controllers\IncidentController;
use App\Modules\Monitoring\Http\Controllers\MonitorController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('monitors', [MonitorController::class, 'index'])->middleware('permission:monitoring.monitor.view')->name('monitors.index');
    Route::post('monitors', [MonitorController::class, 'store'])->middleware('permission:monitoring.monitor.create')->name('monitors.store');
    Route::get('monitors/{id}', [MonitorController::class, 'show'])->whereUuid('id')->middleware('permission:monitoring.monitor.view')->name('monitors.show');
    Route::patch('monitors/{id}', [MonitorController::class, 'update'])->whereUuid('id')->middleware('permission:monitoring.monitor.update')->name('monitors.update');
    Route::post('monitors/{id}/activate', [MonitorController::class, 'activate'])->whereUuid('id')->middleware('permission:monitoring.monitor.update')->name('monitors.activate');
    Route::post('monitors/{id}/pause', [MonitorController::class, 'pause'])->whereUuid('id')->middleware('permission:monitoring.monitor.update')->name('monitors.pause');
    Route::delete('monitors/{id}', [MonitorController::class, 'destroy'])->whereUuid('id')->middleware('permission:monitoring.monitor.delete')->name('monitors.destroy');

    Route::get('incidents', [IncidentController::class, 'index'])->middleware('permission:monitoring.incident.view')->name('incidents.index');
    Route::post('incidents', [IncidentController::class, 'store'])->middleware('permission:monitoring.incident.create')->name('incidents.store');
    Route::get('incidents/{id}', [IncidentController::class, 'show'])->whereUuid('id')->middleware('permission:monitoring.incident.view')->name('incidents.show');
    Route::patch('incidents/{id}', [IncidentController::class, 'update'])->whereUuid('id')->middleware('permission:monitoring.incident.update')->name('incidents.update');
    Route::post('incidents/{id}/status', [IncidentController::class, 'changeStatus'])->whereUuid('id')->middleware('permission:monitoring.incident.update')->name('incidents.status');
    Route::delete('incidents/{id}', [IncidentController::class, 'destroy'])->whereUuid('id')->middleware('permission:monitoring.incident.delete')->name('incidents.destroy');
});
