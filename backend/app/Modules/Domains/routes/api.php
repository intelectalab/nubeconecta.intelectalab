<?php

declare(strict_types=1);

use App\Modules\Domains\Http\Controllers\DomainContactController;
use App\Modules\Domains\Http\Controllers\DomainController;
use App\Modules\Domains\Http\Controllers\Portal\PortalDomainController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Domains (M-DOM, fase 1: dominios en modo manual), cargadas por
| DomainsServiceProvider bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff', 'throttle:120,1'])->group(function (): void {
    Route::get('domains', [DomainController::class, 'index'])->middleware('permission:domains.domain.view')->name('domains.index');
    Route::get('domains/summary', [DomainController::class, 'summary'])->middleware('permission:domains.domain.view')->name('domains.summary');
    Route::post('domains', [DomainController::class, 'store'])->middleware(['permission:domains.domain.create', 'idempotency:optional'])->name('domains.store');
    Route::get('domains/{id}', [DomainController::class, 'show'])->whereUuid('id')->middleware('permission:domains.domain.view')->name('domains.show');
    Route::patch('domains/{id}', [DomainController::class, 'update'])->whereUuid('id')->middleware('permission:domains.domain.update')->name('domains.update');
    Route::delete('domains/{id}', [DomainController::class, 'destroy'])->whereUuid('id')->middleware('permission:domains.domain.delete')->name('domains.destroy');
    Route::post('domains/{id}/renew', [DomainController::class, 'renew'])->whereUuid('id')->middleware('permission:domains.domain.update')->name('domains.renew');

    Route::get('domains/{id}/contacts', [DomainContactController::class, 'index'])->whereUuid('id')->middleware('permission:domains.domain_contact.view')->name('domains.contacts.index');
    Route::post('domains/{id}/contacts', [DomainContactController::class, 'store'])->whereUuid('id')->middleware(['permission:domains.domain_contact.update', 'idempotency:optional'])->name('domains.contacts.store');
    Route::patch('domains/{id}/contacts/{contact}', [DomainContactController::class, 'update'])->whereUuid('id')->whereUuid('contact')->middleware(['permission:domains.domain_contact.update', 'permission:domains.domain_contact.view'])->name('domains.contacts.update');
    Route::delete('domains/{id}/contacts/{contact}', [DomainContactController::class, 'destroy'])->whereUuid('id')->whereUuid('contact')->middleware('permission:domains.domain_contact.update')->name('domains.contacts.destroy');
});

// Portal del cliente: sus propios dominios (solo lectura).
Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('domains', [PortalDomainController::class, 'index'])->middleware('permission:portal.domain.view')->name('domains.index');
    Route::get('domains/{id}', [PortalDomainController::class, 'show'])->whereUuid('id')->middleware('permission:portal.domain.view')->name('domains.show');
});
