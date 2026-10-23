<?php

declare(strict_types=1);

use App\Modules\WebConnector\Http\Controllers\WpCacheInvalidationController;
use App\Modules\WebConnector\Http\Controllers\WpPublicController;
use App\Modules\WebConnector\Http\Controllers\WpSiteController;
use App\Modules\WebConnector\Http\Controllers\WpSiteTokenController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo WebConnector (M-WCN), cargadas por WebConnectorServiceProvider
| bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin/web-connector')->name('admin.web-connector.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('sites', [WpSiteController::class, 'index'])->middleware('permission:web_connector.site.view')->name('sites.index');
    Route::post('sites', [WpSiteController::class, 'store'])->middleware(['permission:web_connector.site.create', 'idempotency:optional'])->name('sites.store');

    Route::prefix('sites/{id}')->whereUuid('id')->name('sites.')->group(function (): void {
        Route::get('/', [WpSiteController::class, 'show'])->middleware('permission:web_connector.site.view')->name('show');
        Route::patch('/', [WpSiteController::class, 'update'])->middleware('permission:web_connector.site.update')->name('update');
        Route::delete('/', [WpSiteController::class, 'destroy'])->middleware('permission:web_connector.site.delete')->name('destroy');
        Route::post('webhook-secret', [WpSiteController::class, 'rotateSecret'])->middleware(['permission:web_connector.site.update', 'mfa.recent'])->name('webhook-secret');
        Route::post('test-webhook', [WpSiteController::class, 'testWebhook'])->middleware('permission:web_connector.site.update')->name('test-webhook');
        Route::post('activate', [WpSiteController::class, 'activate'])->middleware(['permission:web_connector.site.update', 'idempotency:optional'])->name('activate');
        Route::post('disable', [WpSiteController::class, 'disable'])->middleware(['permission:web_connector.site.update', 'idempotency:optional'])->name('disable');

        Route::get('tokens', [WpSiteTokenController::class, 'index'])->middleware('permission:web_connector.site_token.view')->name('tokens.index');
        Route::post('tokens', [WpSiteTokenController::class, 'store'])->middleware('permission:web_connector.site_token.create')->name('tokens.store');
        Route::delete('tokens/{tokenId}', [WpSiteTokenController::class, 'destroy'])->whereUuid('tokenId')->middleware('permission:web_connector.site_token.delete')->name('tokens.destroy');
    });

    Route::get('cache-invalidations', [WpCacheInvalidationController::class, 'index'])->middleware('permission:web_connector.cache_invalidation.view')->name('cache-invalidations.index');
    Route::post('cache-invalidations', [WpCacheInvalidationController::class, 'store'])->middleware(['permission:web_connector.cache_invalidation.create', 'idempotency:optional'])->name('cache-invalidations.store');
    Route::post('cache-invalidations/{id}/retry', [WpCacheInvalidationController::class, 'retry'])->whereUuid('id')->middleware(['permission:web_connector.cache_invalidation.create', 'idempotency:optional'])->name('cache-invalidations.retry');
});

// API de lectura del plugin: primero el token del sitio (fija marca y organización), luego el límite por token.
Route::prefix('public/wp')->name('public.wp.')->middleware(['wp.site', 'throttle:wp-plugin'])->group(function (): void {
    Route::get('site', [WpPublicController::class, 'site'])->name('site');
    Route::get('catalog/categories', [WpPublicController::class, 'categories'])->name('catalog.categories');
    Route::get('catalog/plans', [WpPublicController::class, 'plans'])->name('catalog.plans');
    Route::get('catalog/plans/{id}', [WpPublicController::class, 'plan'])->whereUuid('id')->name('catalog.plans.show');
    Route::get('contact', [WpPublicController::class, 'contact'])->name('contact');
});
