<?php

declare(strict_types=1);

use App\Modules\Mail\Http\Controllers\MailServiceController;
use App\Modules\Mail\Http\Controllers\SslCertificateController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Mail (correo y SSL en modo manual), cargadas por MailServiceProvider
| bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff', 'throttle:120,1'])->group(function (): void {
    Route::get('mail/summary', [MailServiceController::class, 'summary'])->middleware('permission:mail.mail_service.view')->name('mail.summary');

    Route::get('mail/services', [MailServiceController::class, 'index'])->middleware('permission:mail.mail_service.view')->name('mail.services.index');
    Route::post('mail/services', [MailServiceController::class, 'store'])->middleware(['permission:mail.mail_service.create', 'idempotency:optional'])->name('mail.services.store');
    Route::get('mail/services/{id}', [MailServiceController::class, 'show'])->whereUuid('id')->middleware('permission:mail.mail_service.view')->name('mail.services.show');
    Route::patch('mail/services/{id}', [MailServiceController::class, 'update'])->whereUuid('id')->middleware('permission:mail.mail_service.update')->name('mail.services.update');
    Route::delete('mail/services/{id}', [MailServiceController::class, 'destroy'])->whereUuid('id')->middleware('permission:mail.mail_service.delete')->name('mail.services.destroy');
    Route::get('mail/services/{id}/dns-checks', [MailServiceController::class, 'dnsChecks'])->whereUuid('id')->middleware(['permission:mail.mail_service.view', 'permission:mail.mail_dns_check.view'])->name('mail.services.dns-checks');

    Route::get('mail/ssl-certificates', [SslCertificateController::class, 'index'])->middleware('permission:mail.ssl_certificate.view')->name('mail.ssl.index');
    Route::post('mail/ssl-certificates', [SslCertificateController::class, 'store'])->middleware(['permission:mail.ssl_certificate.create', 'idempotency:optional'])->name('mail.ssl.store');
    Route::get('mail/ssl-certificates/{id}', [SslCertificateController::class, 'show'])->whereUuid('id')->middleware('permission:mail.ssl_certificate.view')->name('mail.ssl.show');
    Route::patch('mail/ssl-certificates/{id}', [SslCertificateController::class, 'update'])->whereUuid('id')->middleware('permission:mail.ssl_certificate.update')->name('mail.ssl.update');
    Route::delete('mail/ssl-certificates/{id}', [SslCertificateController::class, 'destroy'])->whereUuid('id')->middleware('permission:mail.ssl_certificate.delete')->name('mail.ssl.destroy');
    Route::post('mail/ssl-certificates/{id}/renew', [SslCertificateController::class, 'renew'])->whereUuid('id')->middleware('permission:mail.ssl_certificate.update')->name('mail.ssl.renew');
});
