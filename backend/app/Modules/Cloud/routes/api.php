<?php

declare(strict_types=1);

use App\Modules\Cloud\Http\Controllers\CloudAccountController;
use App\Modules\Cloud\Http\Controllers\CloudBudgetController;
use App\Modules\Cloud\Http\Controllers\CloudProjectController;
use App\Modules\Cloud\Http\Controllers\CloudResourceController;
use App\Modules\Cloud\Http\Controllers\CloudSummaryController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Cloud (MVP manual: cuentas, proyectos y presupuestos con CRUD; recursos solo lectura),
| cargadas por CloudServiceProvider bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin/cloud')->name('admin.cloud.')->middleware(['hub.auth', 'user.type:staff', 'throttle:120,1'])->group(function (): void {
    Route::get('summary', CloudSummaryController::class)->middleware('permission:cloud.cloud_project.view')->name('summary');

    Route::get('accounts', [CloudAccountController::class, 'index'])->middleware('permission:cloud.cloud_account.view')->name('accounts.index');
    Route::post('accounts', [CloudAccountController::class, 'store'])->middleware(['permission:cloud.cloud_account.create', 'idempotency:optional'])->name('accounts.store');
    Route::get('accounts/{id}', [CloudAccountController::class, 'show'])->whereUuid('id')->middleware('permission:cloud.cloud_account.view')->name('accounts.show');
    Route::patch('accounts/{id}', [CloudAccountController::class, 'update'])->whereUuid('id')->middleware('permission:cloud.cloud_account.update')->name('accounts.update');
    Route::delete('accounts/{id}', [CloudAccountController::class, 'destroy'])->whereUuid('id')->middleware('permission:cloud.cloud_account.delete')->name('accounts.destroy');

    Route::get('projects', [CloudProjectController::class, 'index'])->middleware('permission:cloud.cloud_project.view')->name('projects.index');
    Route::post('projects', [CloudProjectController::class, 'store'])->middleware(['permission:cloud.cloud_project.create', 'idempotency:optional'])->name('projects.store');
    Route::get('projects/{id}', [CloudProjectController::class, 'show'])->whereUuid('id')->middleware('permission:cloud.cloud_project.view')->name('projects.show');
    Route::patch('projects/{id}', [CloudProjectController::class, 'update'])->whereUuid('id')->middleware('permission:cloud.cloud_project.update')->name('projects.update');
    Route::delete('projects/{id}', [CloudProjectController::class, 'destroy'])->whereUuid('id')->middleware('permission:cloud.cloud_project.delete')->name('projects.destroy');

    Route::get('resources', [CloudResourceController::class, 'index'])->middleware('permission:cloud.cloud_resource.view')->name('resources.index');
    Route::get('resources/{id}', [CloudResourceController::class, 'show'])->whereUuid('id')->middleware('permission:cloud.cloud_resource.view')->name('resources.show');

    Route::get('budgets', [CloudBudgetController::class, 'index'])->middleware('permission:cloud.cloud_budget.view')->name('budgets.index');
    Route::post('budgets', [CloudBudgetController::class, 'store'])->middleware(['permission:cloud.cloud_budget.create', 'idempotency:optional'])->name('budgets.store');
    Route::get('budgets/{id}', [CloudBudgetController::class, 'show'])->whereUuid('id')->middleware('permission:cloud.cloud_budget.view')->name('budgets.show');
    Route::patch('budgets/{id}', [CloudBudgetController::class, 'update'])->whereUuid('id')->middleware('permission:cloud.cloud_budget.update')->name('budgets.update');
    Route::delete('budgets/{id}', [CloudBudgetController::class, 'destroy'])->whereUuid('id')->middleware('permission:cloud.cloud_budget.delete')->name('budgets.destroy');
});
