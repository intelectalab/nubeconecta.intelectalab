<?php

declare(strict_types=1);

use App\Modules\Monitoring\Http\Controllers\BackupPolicyController;
use App\Modules\Monitoring\Http\Controllers\BackupRunController;
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

    // Respaldos (modo manual): políticas y corridas.
    Route::get('backup-policies', [BackupPolicyController::class, 'index'])->middleware('permission:monitoring.backup_policy.view')->name('backup-policies.index');
    Route::post('backup-policies', [BackupPolicyController::class, 'store'])->middleware('permission:monitoring.backup_policy.create')->name('backup-policies.store');
    Route::get('backup-policies/{id}', [BackupPolicyController::class, 'show'])->whereUuid('id')->middleware('permission:monitoring.backup_policy.view')->name('backup-policies.show');
    Route::patch('backup-policies/{id}', [BackupPolicyController::class, 'update'])->whereUuid('id')->middleware('permission:monitoring.backup_policy.update')->name('backup-policies.update');
    Route::delete('backup-policies/{id}', [BackupPolicyController::class, 'destroy'])->whereUuid('id')->middleware('permission:monitoring.backup_policy.delete')->name('backup-policies.destroy');
    Route::get('backup-runs', [BackupRunController::class, 'index'])->middleware('permission:monitoring.backup_run.view')->name('backup-runs.index');
    Route::post('backup-runs', [BackupRunController::class, 'store'])->middleware('permission:monitoring.backup_run.create')->name('backup-runs.store');
});
