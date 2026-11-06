<?php

declare(strict_types=1);

use App\Modules\Notifications\Http\Controllers\NotificationDeliveryController;
use App\Modules\Notifications\Http\Controllers\NotificationTemplateController;
use App\Modules\Notifications\Http\Controllers\NotificationTestController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('notification-templates', [NotificationTemplateController::class, 'index'])->middleware('permission:automation.notification_template.view')->name('notification-templates.index');
    Route::post('notification-templates', [NotificationTemplateController::class, 'store'])->middleware('permission:automation.notification_template.create')->name('notification-templates.store');
    Route::get('notification-templates/{id}', [NotificationTemplateController::class, 'show'])->whereUuid('id')->middleware('permission:automation.notification_template.view')->name('notification-templates.show');
    Route::patch('notification-templates/{id}', [NotificationTemplateController::class, 'update'])->whereUuid('id')->middleware('permission:automation.notification_template.update')->name('notification-templates.update');
    Route::delete('notification-templates/{id}', [NotificationTemplateController::class, 'destroy'])->whereUuid('id')->middleware('permission:automation.notification_template.delete')->name('notification-templates.destroy');
    Route::get('notification-deliveries', [NotificationDeliveryController::class, 'index'])->middleware('permission:automation.notification_delivery.view')->name('notification-deliveries.index');
    Route::get('notification-deliveries/{id}', [NotificationDeliveryController::class, 'show'])->whereUuid('id')->middleware('permission:automation.notification_delivery.view')->name('notification-deliveries.show');
    Route::post('notifications/test', NotificationTestController::class)->middleware('permission:automation.notification_template.update')->name('notifications.test');
});
