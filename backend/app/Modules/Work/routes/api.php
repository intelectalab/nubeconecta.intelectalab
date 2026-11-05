<?php

declare(strict_types=1);

use App\Modules\Work\Http\Controllers\TaskController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('tasks', [TaskController::class, 'index'])->middleware('permission:work.task.view')->name('tasks.index');
    Route::post('tasks', [TaskController::class, 'store'])->middleware(['permission:work.task.create', 'idempotency:optional'])->name('tasks.store');
    Route::get('tasks/{id}', [TaskController::class, 'show'])->whereUuid('id')->middleware('permission:work.task.view')->name('tasks.show');
    Route::patch('tasks/{id}', [TaskController::class, 'update'])->whereUuid('id')->middleware('permission:work.task.update')->name('tasks.update');
    Route::post('tasks/{id}/status', [TaskController::class, 'changeStatus'])->whereUuid('id')->middleware('permission:work.task.update')->name('tasks.status');
    Route::post('tasks/{id}/assign', [TaskController::class, 'assign'])->whereUuid('id')->middleware('permission:work.task.update')->name('tasks.assign');
    Route::post('tasks/{id}/approve', [TaskController::class, 'approve'])->whereUuid('id')->middleware('permission:work.task.approve')->name('tasks.approve');
    Route::delete('tasks/{id}', [TaskController::class, 'destroy'])->whereUuid('id')->middleware('permission:work.task.delete')->name('tasks.destroy');
});
