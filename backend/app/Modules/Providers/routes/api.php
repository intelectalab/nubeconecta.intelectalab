<?php

declare(strict_types=1);

use App\Modules\Providers\Http\Controllers\Admin\ProviderAccountController;
use App\Modules\Providers\Http\Controllers\Admin\ProviderController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('providers', [ProviderController::class, 'index'])->middleware('permission:providers.provider.view')->name('providers.index');
    Route::post('providers', [ProviderController::class, 'store'])->middleware(['permission:providers.provider.create', 'idempotency:optional'])->name('providers.store');
    Route::get('providers/{id}', [ProviderController::class, 'show'])->whereUuid('id')->middleware('permission:providers.provider.view')->name('providers.show');
    Route::patch('providers/{id}', [ProviderController::class, 'update'])->whereUuid('id')->middleware('permission:providers.provider.update')->name('providers.update');
    Route::delete('providers/{id}', [ProviderController::class, 'destroy'])->whereUuid('id')->middleware('permission:providers.provider.delete')->name('providers.destroy');
    Route::get('providers/{provider}/accounts', [ProviderAccountController::class, 'index'])->whereUuid('provider')->middleware('permission:providers.provider_account.view')->name('providers.accounts.index');
    Route::post('providers/{provider}/accounts', [ProviderAccountController::class, 'store'])->whereUuid('provider')->middleware(['permission:providers.provider_account.create', 'idempotency:optional'])->name('providers.accounts.store');
    Route::get('provider-accounts/{id}', [ProviderAccountController::class, 'show'])->whereUuid('id')->middleware('permission:providers.provider_account.view')->name('provider-accounts.show');
    Route::patch('provider-accounts/{id}', [ProviderAccountController::class, 'update'])->whereUuid('id')->middleware('permission:providers.provider_account.update')->name('provider-accounts.update');
    Route::delete('provider-accounts/{id}', [ProviderAccountController::class, 'destroy'])->whereUuid('id')->middleware('permission:providers.provider_account.delete')->name('provider-accounts.destroy');
});
