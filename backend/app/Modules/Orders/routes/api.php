<?php

declare(strict_types=1);

use App\Modules\Orders\Http\Controllers\OrderController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Orders (M-ORD, franja MVP), cargadas por OrdersServiceProvider
| bajo /api/v1 con el grupo `api` (nombres api.v1.*). Crear, aprobar y anular
| exigen Idempotency-Key (M-ORD §5).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('orders', [OrderController::class, 'index'])->middleware('permission:orders.order.view')->name('orders.index');
    Route::post('orders', [OrderController::class, 'store'])->middleware(['permission:orders.order.create', 'idempotency'])->name('orders.store');
    Route::get('orders/{id}', [OrderController::class, 'show'])->whereUuid('id')->middleware('permission:orders.order.view')->name('orders.show');
    Route::post('orders/{id}/approve', [OrderController::class, 'approve'])->whereUuid('id')->middleware(['permission:orders.order.approve', 'idempotency'])->name('orders.approve');
    Route::post('orders/{id}/cancel', [OrderController::class, 'cancel'])->whereUuid('id')->middleware(['permission:orders.order.update', 'idempotency'])->name('orders.cancel');
});
