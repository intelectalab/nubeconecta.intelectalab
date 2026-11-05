<?php

declare(strict_types=1);

use App\Modules\Support\Http\Controllers\ComplaintController;
use App\Modules\Support\Http\Controllers\Portal\PortalComplaintController;
use App\Modules\Support\Http\Controllers\Portal\PortalTicketController;
use App\Modules\Support\Http\Controllers\TicketController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    $crud = static function (string $path, string $controller, string $permission): void {
        Route::get($path, [$controller, 'index'])->middleware("permission:{$permission}.view")->name("{$path}.index");
        Route::post($path, [$controller, 'store'])->middleware(["permission:{$permission}.create", 'idempotency:optional'])->name("{$path}.store");
        Route::get("{$path}/{id}", [$controller, 'show'])->whereUuid('id')->middleware("permission:{$permission}.view")->name("{$path}.show");
        Route::patch("{$path}/{id}", [$controller, 'update'])->whereUuid('id')->middleware("permission:{$permission}.update")->name("{$path}.update");
        Route::delete("{$path}/{id}", [$controller, 'destroy'])->whereUuid('id')->middleware("permission:{$permission}.delete")->name("{$path}.destroy");
    };

    $crud('tickets', TicketController::class, 'helpdesk.ticket');
    Route::post('tickets/{id}/messages', [TicketController::class, 'addMessage'])->whereUuid('id')->middleware(['permission:helpdesk.ticket_message.create', 'idempotency:optional'])->name('tickets.messages.store');
    $crud('complaints', ComplaintController::class, 'helpdesk.complaint');
    Route::post('complaints/{id}/responses', [ComplaintController::class, 'addResponse'])->whereUuid('id')->middleware(['permission:helpdesk.complaint.respond', 'idempotency:optional'])->name('complaints.responses.store');
});

Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('complaints', [PortalComplaintController::class, 'index'])->middleware('permission:portal.complaint.view')->name('complaints.index');
    Route::post('complaints', [PortalComplaintController::class, 'store'])->middleware(['permission:portal.complaint.create', 'idempotency:optional'])->name('complaints.store');
    Route::get('complaints/{id}', [PortalComplaintController::class, 'show'])->whereUuid('id')->middleware('permission:portal.complaint.view')->name('complaints.show');
    Route::get('tickets', [PortalTicketController::class, 'index'])->middleware('permission:portal.ticket.view')->name('tickets.index');
    Route::post('tickets', [PortalTicketController::class, 'store'])->middleware(['permission:portal.ticket.create', 'idempotency:optional'])->name('tickets.store');
    Route::get('tickets/{id}', [PortalTicketController::class, 'show'])->whereUuid('id')->middleware('permission:portal.ticket.view')->name('tickets.show');
    Route::post('tickets/{id}/messages', [PortalTicketController::class, 'addMessage'])->whereUuid('id')->middleware(['permission:portal.ticket.create', 'idempotency:optional'])->name('tickets.messages.store');
});
