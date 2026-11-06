<?php

declare(strict_types=1);

use App\Modules\Files\Http\Controllers\FileController;
use App\Modules\Files\Http\Controllers\Portal\FileController as PortalFileController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::post('files', [FileController::class, 'store'])->middleware('permission:identity.file.create')->name('files.store');
    Route::get('files/{id}', [FileController::class, 'show'])->whereUuid('id')->middleware('permission:identity.file.view')->name('files.show');
    Route::delete('files/{id}', [FileController::class, 'destroy'])->whereUuid('id')->middleware('permission:identity.file.delete')->name('files.destroy');
});

Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::post('files', [PortalFileController::class, 'store'])->middleware(['permission:portal.ticket.create', 'idempotency:optional'])->name('files.store');
    Route::get('files/{id}', [PortalFileController::class, 'show'])->whereUuid('id')->middleware('permission:portal.ticket.view')->name('files.show');
});
