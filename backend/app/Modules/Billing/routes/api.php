<?php

declare(strict_types=1);

use App\Modules\Billing\Http\Controllers\CollectionsController;
use App\Modules\Billing\Http\Controllers\InvoiceController;
use App\Modules\Billing\Http\Controllers\MercadoPagoWebhookController;
use App\Modules\Billing\Http\Controllers\PaymentController;
use App\Modules\Billing\Http\Controllers\Portal\PortalCardPaymentController;
use App\Modules\Billing\Http\Controllers\Portal\PortalInvoiceController;
use App\Modules\Billing\Http\Controllers\Portal\PortalPaymentController;
use App\Modules\Billing\Http\Controllers\Portal\PortalSummaryController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Billing (M-BIL, franja MVP) bajo /api/v1. Emitir y anular
| exigen Idempotency-Key (M-BIL §4.2); anular exige motivo. Pagos, vouchers
| y cobranza: ver README.
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('invoices', [InvoiceController::class, 'index'])->middleware('permission:billing.invoice.view')->name('invoices.index');
    Route::get('invoices/{id}', [InvoiceController::class, 'show'])->whereUuid('id')->middleware('permission:billing.invoice.view')->name('invoices.show');
    Route::get('invoices/{id}/document', [InvoiceController::class, 'document'])->whereUuid('id')->middleware('permission:billing.invoice.view')->name('invoices.document');
    Route::post('invoices/{id}/issue', [InvoiceController::class, 'issue'])->whereUuid('id')->middleware(['permission:billing.invoice.issue', 'idempotency'])->name('invoices.issue');
    Route::post('invoices/{id}/void', [InvoiceController::class, 'void'])->whereUuid('id')->middleware(['permission:billing.invoice.void', 'idempotency'])->name('invoices.void');

    // Pagos (P-BIL-05..08): registrar, validar, rechazar y anular con Idempotency-Key.
    Route::get('payment-methods', [PaymentController::class, 'methods'])->middleware('permission:billing.payment.create')->name('payment-methods.index');
    Route::get('payments', [PaymentController::class, 'index'])->middleware('permission:billing.payment.view')->name('payments.index');
    Route::post('payments', [PaymentController::class, 'store'])->middleware(['permission:billing.payment.create', 'idempotency'])->name('payments.store');
    Route::get('payments/{id}', [PaymentController::class, 'show'])->whereUuid('id')->middleware('permission:billing.payment.view')->name('payments.show');
    Route::get('payments/{id}/proof', [PaymentController::class, 'proof'])->whereUuid('id')->middleware('permission:billing.payment.view')->name('payments.proof');
    Route::post('payments/{id}/validate', [PaymentController::class, 'validatePayment'])->whereUuid('id')->middleware(['permission:billing.payment.validate', 'idempotency'])->name('payments.validate');
    Route::post('payments/{id}/reject', [PaymentController::class, 'reject'])->whereUuid('id')->middleware(['permission:billing.payment.validate', 'idempotency'])->name('payments.reject');
    Route::post('payments/{id}/void', [PaymentController::class, 'void'])->whereUuid('id')->middleware(['permission:billing.payment.validate', 'idempotency'])->name('payments.void');

    // Cobranza (P-BIL-01/12).
    Route::get('collections/aging', [CollectionsController::class, 'aging'])->middleware('permission:billing.invoice.view')->name('collections.aging');
    Route::get('collections/dunning-events', [CollectionsController::class, 'dunningEvents'])->middleware('permission:billing.dunning_event.view')->name('collections.dunning-events');
});

Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('invoices', [PortalInvoiceController::class, 'index'])->middleware('permission:portal.invoice.view')->name('invoices.index');
    Route::get('invoices/{id}', [PortalInvoiceController::class, 'show'])->whereUuid('id')->middleware('permission:portal.invoice.view')->name('invoices.show');
    Route::get('invoices/{id}/document', [PortalInvoiceController::class, 'document'])->whereUuid('id')->middleware('permission:portal.invoice.view')->name('invoices.document');
    Route::post('invoices/{id}/vouchers', [PortalPaymentController::class, 'submitVoucher'])->whereUuid('id')->middleware(['permission:portal.payment.create', 'idempotency'])->name('invoices.vouchers.store');
    // Pago con tarjeta (Mercado Pago Checkout Pro): intento con Idempotency-Key, retorno que consulta a la pasarela.
    Route::post('invoices/{id}/card-payment', [PortalCardPaymentController::class, 'store'])->whereUuid('id')->middleware(['permission:portal.payment.create', 'idempotency', 'throttle:card-start'])->name('invoices.card-payment.store');
    Route::get('card-payments/{id}', [PortalCardPaymentController::class, 'show'])->whereUuid('id')->middleware('permission:portal.payment.view')->name('card-payments.show');
    Route::post('card-payments/{id}/confirm', [PortalCardPaymentController::class, 'confirm'])->whereUuid('id')->middleware(['permission:portal.payment.view', 'throttle:card-confirm'])->name('card-payments.confirm');

    Route::get('summary', PortalSummaryController::class)->middleware('permission:portal.account.view')->name('summary');
    Route::get('payment-methods', [PortalPaymentController::class, 'methods'])->middleware('permission:portal.payment.view')->name('payment-methods.index');
    Route::get('payments', [PortalPaymentController::class, 'index'])->middleware('permission:portal.payment.view')->name('payments.index');
    Route::get('payments/{id}', [PortalPaymentController::class, 'show'])->whereUuid('id')->middleware('permission:portal.payment.view')->name('payments.show');
    Route::get('payments/{id}/proof', [PortalPaymentController::class, 'proof'])->whereUuid('id')->middleware('permission:portal.payment.view')->name('payments.proof');
});

// Webhook público de Mercado Pago: sin sesión, firma x-signature obligatoria.
Route::post('webhooks/mercadopago', MercadoPagoWebhookController::class)->middleware('throttle:card-webhooks')->name('webhooks.mercadopago');
