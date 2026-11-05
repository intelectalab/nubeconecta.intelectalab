<?php

declare(strict_types=1);

use App\Modules\Finance\Http\Controllers\CostAllocationController;
use App\Modules\Finance\Http\Controllers\CostController;
use App\Modules\Finance\Http\Controllers\ProfitabilityController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('costs', [CostController::class, 'index'])->middleware('permission:finance.cost.view')->name('costs.index');
    Route::post('costs', [CostController::class, 'store'])->middleware('permission:finance.cost.create')->name('costs.store');
    Route::get('costs/{id}', [CostController::class, 'show'])->whereUuid('id')->middleware('permission:finance.cost.view')->name('costs.show');
    Route::patch('costs/{id}', [CostController::class, 'update'])->whereUuid('id')->middleware('permission:finance.cost.update')->name('costs.update');
    Route::delete('costs/{id}', [CostController::class, 'destroy'])->whereUuid('id')->middleware('permission:finance.cost.delete')->name('costs.destroy');
    Route::get('cost-allocations', [CostAllocationController::class, 'index'])->middleware('permission:finance.cost_allocation.view')->name('cost-allocations.index');
    Route::post('cost-allocations', [CostAllocationController::class, 'store'])->middleware('permission:finance.cost_allocation.create')->name('cost-allocations.store');
    Route::get('cost-allocations/{id}', [CostAllocationController::class, 'show'])->whereUuid('id')->middleware('permission:finance.cost_allocation.view')->name('cost-allocations.show');
    // permissions.json expone create/view para allocations; edición y borrado usan el permiso equivalente de costos.
    Route::patch('cost-allocations/{id}', [CostAllocationController::class, 'update'])->whereUuid('id')->middleware('permission:finance.cost.update')->name('cost-allocations.update');
    Route::delete('cost-allocations/{id}', [CostAllocationController::class, 'destroy'])->whereUuid('id')->middleware('permission:finance.cost.delete')->name('cost-allocations.destroy');
    Route::get('finance/profitability', ProfitabilityController::class)->middleware('permission:finance.profitability.view')->name('finance.profitability');
});
