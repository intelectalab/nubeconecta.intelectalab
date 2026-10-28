<?php

declare(strict_types=1);

use App\Modules\Sales\Http\Controllers\LeadController;
use App\Modules\Sales\Http\Controllers\WebSubmissionLeadController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Sales (M-SAL), cargadas por SalesServiceProvider bajo
| /api/v1 con el grupo `api` (nombres api.v1.*). Rutas según docs/04 RN-SAL-011.
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('leads', [LeadController::class, 'index'])->middleware('permission:sales.lead.view')->name('leads.index');
    Route::post('leads', [LeadController::class, 'store'])->middleware(['permission:sales.lead.create', 'idempotency:optional'])->name('leads.store');
    Route::get('leads/board', [LeadController::class, 'board'])->middleware('permission:sales.lead.view')->name('leads.board');
    Route::get('leads/options', [LeadController::class, 'options'])->middleware('permission:sales.lead.view')->name('leads.options');

    Route::prefix('leads/{id}')->whereUuid('id')->name('leads.')->group(function (): void {
        Route::get('/', [LeadController::class, 'show'])->middleware('permission:sales.lead.view')->name('show');
        Route::patch('/', [LeadController::class, 'update'])->middleware('permission:sales.lead.update')->name('update');
        Route::post('move-stage', [LeadController::class, 'move'])->middleware('permission:sales.lead.update')->name('move-stage');
        Route::post('lose', [LeadController::class, 'lose'])->middleware('permission:sales.lead.update')->name('lose');
        Route::post('convert', [LeadController::class, 'convert'])->middleware(['permission:sales.lead.update', 'permission:customers.customer.create', 'idempotency:optional'])->name('convert');
        Route::post('activities', [LeadController::class, 'storeActivity'])->middleware('permission:sales.lead_activity.create')->name('activities.store');
    });
    Route::patch('lead-activities/{id}', [LeadController::class, 'updateActivity'])->whereUuid('id')->middleware('permission:sales.lead_activity.update')->name('lead-activities.update');

    Route::post('web-connector/form-submissions/{id}/lead', WebSubmissionLeadController::class)->whereUuid('id')->middleware(['permission:sales.lead.create', 'permission:web_connector.form_submission.view'])->name('web-connector.form-submissions.lead');
});
