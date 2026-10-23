<?php

declare(strict_types=1);

use App\Modules\Customers\Http\Controllers\Admin\ContactController;
use App\Modules\Customers\Http\Controllers\Admin\CustomerController;
use App\Modules\Customers\Http\Controllers\Admin\CustomerNoteController;
use App\Modules\Customers\Http\Controllers\Admin\PrivacyController;
use App\Modules\Customers\Http\Controllers\Portal\PortalAccountController;
use App\Modules\Customers\Http\Controllers\Public\UnsubscribeController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Customers (M-CUS), cargadas por CustomersServiceProvider
| bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('customers', [CustomerController::class, 'index'])->middleware('permission:customers.customer.view')->name('customers.index');
    Route::post('customers', [CustomerController::class, 'store'])->middleware(['permission:customers.customer.create', 'idempotency:optional'])->name('customers.store');
    Route::get('customers/duplicates', [CustomerController::class, 'duplicates'])->middleware('permission:customers.customer.view')->name('customers.duplicates');
    Route::get('customers/tax-id-lookup', [CustomerController::class, 'taxIdLookup'])->middleware('permission:customers.customer.view')->name('customers.tax-id-lookup');
    Route::get('customers/merge-preview', [CustomerController::class, 'mergePreview'])->middleware('permission:customers.customer.update')->name('customers.merge-preview');
    Route::post('customers/merge', [CustomerController::class, 'merge'])->middleware(['permission:customers.customer.update', 'idempotency:optional'])->name('customers.merge');
    Route::post('customers/exports', [CustomerController::class, 'export'])->middleware('permission:customers.customer.export')->name('customers.exports');
    Route::get('customers/import-templates/{kind}', [PrivacyController::class, 'template'])->middleware('permission:customers.customer.create')->name('customers.import-templates');
    Route::post('customers/imports', [PrivacyController::class, 'import'])->middleware(['permission:customers.customer.create', 'idempotency:optional'])->name('customers.imports');

    Route::prefix('customers/{id}')->whereUuid('id')->name('customers.')->group(function (): void {
        Route::get('/', [CustomerController::class, 'show'])->middleware('permission:customers.customer.view')->name('show');
        Route::patch('/', [CustomerController::class, 'update'])->middleware('permission:customers.customer.update')->name('update');
        Route::delete('/', [CustomerController::class, 'destroy'])->middleware('permission:customers.customer.delete')->name('destroy');
        Route::get('overview', [CustomerController::class, 'overview'])->middleware('permission:customers.customer.view')->name('overview');
        Route::get('history', [CustomerController::class, 'history'])->middleware('permission:customers.customer.view')->name('history');
        Route::post('personal-data-exports', [PrivacyController::class, 'export'])->middleware(['permission:customers.customer.export', 'idempotency:optional'])->name('personal-data-exports');
        Route::post('personal-data-erasure', [PrivacyController::class, 'erase'])->middleware(['permission:customers.customer.delete', 'idempotency:optional'])->name('personal-data-erasure');
        Route::get('contacts', [ContactController::class, 'index'])->middleware('permission:customers.contact.view')->name('contacts.index');
        Route::post('contacts', [ContactController::class, 'store'])->middleware(['permission:customers.contact.create', 'idempotency:optional'])->name('contacts.store');
        Route::get('notes', [CustomerNoteController::class, 'index'])->middleware('permission:customers.customer_note.view')->name('notes.index');
        Route::post('notes', [CustomerNoteController::class, 'store'])->middleware('permission:customers.customer_note.create')->name('notes.store');
    });

    Route::prefix('contacts/{id}')->whereUuid('id')->name('contacts.')->group(function (): void {
        Route::get('/', [ContactController::class, 'show'])->middleware('permission:customers.contact.view')->name('show');
        Route::patch('/', [ContactController::class, 'update'])->middleware('permission:customers.contact.update')->name('update');
        Route::delete('/', [ContactController::class, 'destroy'])->middleware('permission:customers.contact.delete')->name('destroy');
        Route::post('portal-access', [ContactController::class, 'grantPortal'])->middleware('permission:customers.contact.update')->name('portal-access.grant');
        Route::delete('portal-access', [ContactController::class, 'revokePortal'])->middleware('permission:customers.contact.update')->name('portal-access.revoke');
        Route::post('portal-invitation', [ContactController::class, 'resendInvitation'])->middleware('permission:customers.contact.update')->name('portal-invitation');
        Route::get('communication-consents', [ContactController::class, 'consents'])->middleware('permission:customers.communication_consent.view')->name('consents.index');
        Route::post('communication-consents', [ContactController::class, 'recordConsent'])->middleware('permission:customers.communication_consent.update')->name('consents.store');
    });

    Route::patch('customer-notes/{id}', [CustomerNoteController::class, 'update'])->whereUuid('id')->middleware('permission:customers.customer_note.update')->name('customer-notes.update');
    Route::delete('customer-notes/{id}', [CustomerNoteController::class, 'destroy'])->whereUuid('id')->middleware('permission:customers.customer_note.delete')->name('customer-notes.destroy');
});

// Portal: el cliente sale de la sesión (contacto enlazado al usuario), nunca de la petición.
Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('account', [PortalAccountController::class, 'show'])->middleware('permission:portal.account.view')->name('account.show');
    Route::patch('account', [PortalAccountController::class, 'update'])->middleware('permission:portal.account.update')->name('account.update');
    Route::get('contacts', [PortalAccountController::class, 'contacts'])->middleware('permission:portal.contact.view')->name('contacts.index');
    Route::post('contacts', [PortalAccountController::class, 'storeContact'])->middleware('permission:portal.contact.create')->name('contacts.store');
    Route::patch('contacts/{id}', [PortalAccountController::class, 'updateContact'])->whereUuid('id')->middleware('permission:portal.contact.update')->name('contacts.update');
    Route::delete('contacts/{id}', [PortalAccountController::class, 'destroyContact'])->whereUuid('id')->middleware('permission:portal.contact.delete')->name('contacts.destroy');
    Route::get('communication-consents', [PortalAccountController::class, 'consents'])->middleware('permission:portal.account.view')->name('communication-consents.index');
    Route::post('communication-consents', [PortalAccountController::class, 'recordConsent'])->middleware('permission:portal.consent.update')->name('communication-consents.store');
});

Route::post('public/communication-unsubscribes', UnsubscribeController::class)->middleware('throttle:customers-unsubscribe')->name('public.communication-unsubscribes');
