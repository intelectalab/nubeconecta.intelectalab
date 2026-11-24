<?php

declare(strict_types=1);

use App\Modules\Contracts\Http\Controllers\ContractController;
use App\Modules\Contracts\Http\Controllers\Portal\PortalContractController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('contracts', [ContractController::class, 'index'])->middleware('permission:contracts.contract.view')->name('contracts.index');
    Route::post('contracts', [ContractController::class, 'store'])->middleware(['permission:contracts.contract.create', 'idempotency'])->name('contracts.store');
    Route::get('contracts/{id}', [ContractController::class, 'show'])->whereUuid('id')->middleware('permission:contracts.contract.view')->name('contracts.show');
    Route::patch('contracts/{id}', [ContractController::class, 'update'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.update');
    Route::post('contracts/{id}/submit', [ContractController::class, 'submit'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.submit');
    Route::post('contracts/{id}/approve', [ContractController::class, 'approve'])->whereUuid('id')->middleware('permission:contracts.contract.approve')->name('contracts.approve');
    Route::post('contracts/{id}/send', [ContractController::class, 'send'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.send');
    Route::post('contracts/{id}/sign', [ContractController::class, 'sign'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.sign');
    Route::post('contracts/{id}/terminate', [ContractController::class, 'terminate'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.terminate');
    Route::post('contracts/{id}/expire', [ContractController::class, 'expire'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.expire');
    Route::post('contracts/{id}/addenda', [ContractController::class, 'addendum'])->whereUuid('id')->middleware('permission:contracts.contract.update')->name('contracts.addenda.store');
    Route::delete('contracts/{id}', [ContractController::class, 'destroy'])->whereUuid('id')->middleware('permission:contracts.contract.delete')->name('contracts.destroy');
});

// Portal del cliente: sus propios contratos (solo lectura).
Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('contracts', [PortalContractController::class, 'index'])->middleware('permission:portal.contract.view')->name('contracts.index');
    Route::get('contracts/{id}', [PortalContractController::class, 'show'])->whereUuid('id')->middleware('permission:portal.contract.view')->name('contracts.show');
});
