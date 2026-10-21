<?php

declare(strict_types=1);

use App\Modules\Settings\Http\Controllers\BusinessHourController;
use App\Modules\Settings\Http\Controllers\HolidayController;
use App\Modules\Settings\Http\Controllers\SettingChangeController;
use App\Modules\Settings\Http\Controllers\SettingController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Settings (M-CFG), cargadas por SettingsServiceProvider bajo
| /api/v1 con el grupo `api`. La escritura de ajustes valida en el servicio el
| permiso propio de cada clave (settings.setting.update o settings.dunning.update).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    $key = '[a-z0-9_]+(\.[a-z0-9_]+)+';

    Route::get('settings', [SettingController::class, 'index'])->middleware('permission:settings.setting.view')->name('settings.index');
    Route::get('settings/{key}', [SettingController::class, 'show'])->where('key', $key)->middleware('permission:settings.setting.view')->name('settings.show');
    Route::get('settings/{key}/resolve', [SettingController::class, 'resolve'])->where('key', $key)->middleware('permission:settings.setting.view')->name('settings.resolve');
    Route::put('settings/{key}', [SettingController::class, 'put'])->where('key', $key)->name('settings.put');
    Route::delete('settings/{key}', [SettingController::class, 'destroy'])->where('key', $key)->name('settings.destroy');

    Route::get('setting-changes', [SettingChangeController::class, 'index'])->middleware('permission:settings.setting_change.view')->name('setting-changes.index');
    Route::post('setting-changes/{id}/revert', [SettingChangeController::class, 'revert'])->whereUuid('id')->middleware(['permission:settings.setting_change.view', 'idempotency:optional'])->name('setting-changes.revert');

    Route::get('holidays', [HolidayController::class, 'index'])->middleware('permission:settings.holiday.view')->name('holidays.index');
    Route::post('holidays', [HolidayController::class, 'store'])->middleware('permission:settings.holiday.create')->name('holidays.store');
    Route::get('holidays/{id}', [HolidayController::class, 'show'])->whereUuid('id')->middleware('permission:settings.holiday.view')->name('holidays.show');
    Route::patch('holidays/{id}', [HolidayController::class, 'update'])->whereUuid('id')->middleware('permission:settings.holiday.update')->name('holidays.update');
    Route::delete('holidays/{id}', [HolidayController::class, 'destroy'])->whereUuid('id')->middleware('permission:settings.holiday.delete')->name('holidays.destroy');

    Route::get('business-hours/{calendar?}', [BusinessHourController::class, 'show'])->where('calendar', '[a-z0-9_-]+')->middleware('permission:settings.business_hours.view')->name('business-hours.show');
    Route::put('business-hours/{calendar?}', [BusinessHourController::class, 'replace'])->where('calendar', '[a-z0-9_-]+')->middleware('permission:settings.business_hours.update')->name('business-hours.replace');
});
