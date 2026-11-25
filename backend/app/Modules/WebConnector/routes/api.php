<?php

declare(strict_types=1);

use App\Modules\WebConnector\Http\Controllers\LegalDocumentController;
use App\Modules\WebConnector\Http\Controllers\WebFormController;
use App\Modules\WebConnector\Http\Controllers\WebFormSubmissionController;
use App\Modules\WebConnector\Http\Controllers\WpCacheInvalidationController;
use App\Modules\WebConnector\Http\Controllers\WpComplaintController;
use App\Modules\WebConnector\Http\Controllers\WpDomainAvailabilityController;
use App\Modules\WebConnector\Http\Controllers\WpFormSubmissionController;
use App\Modules\WebConnector\Http\Controllers\WpPublicController;
use App\Modules\WebConnector\Http\Controllers\Portal\PortalLegalController;
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
    // Bandeja «Solicitudes web»: envíos de contacto y cotización recibidos por el plugin.
    Route::get('form-submissions', [WebFormSubmissionController::class, 'index'])->middleware('permission:web_connector.form_submission.view')->name('form-submissions.index');
    Route::get('form-submissions/summary', [WebFormSubmissionController::class, 'summary'])->middleware('permission:web_connector.form_submission.view')->name('form-submissions.summary');
    Route::get('form-submissions/{id}', [WebFormSubmissionController::class, 'show'])->whereUuid('id')->middleware('permission:web_connector.form_submission.view')->name('form-submissions.show');
    Route::patch('form-submissions/{id}', [WebFormSubmissionController::class, 'update'])->whereUuid('id')->middleware('permission:web_connector.form_submission.update')->name('form-submissions.update');

    Route::post('cache-invalidations/{id}/retry', [WpCacheInvalidationController::class, 'retry'])->whereUuid('id')->middleware(['permission:web_connector.cache_invalidation.create', 'idempotency:optional'])->name('cache-invalidations.retry');

    // Definición de formularios embebibles (y sus campos).
    Route::get('forms', [WebFormController::class, 'index'])->middleware('permission:web_connector.form.view')->name('forms.index');
    Route::post('forms', [WebFormController::class, 'store'])->middleware(['permission:web_connector.form.create', 'idempotency:optional'])->name('forms.store');
    Route::get('forms/{id}', [WebFormController::class, 'show'])->whereUuid('id')->middleware('permission:web_connector.form.view')->name('forms.show');
    Route::patch('forms/{id}', [WebFormController::class, 'update'])->whereUuid('id')->middleware('permission:web_connector.form.update')->name('forms.update');
    Route::delete('forms/{id}', [WebFormController::class, 'destroy'])->whereUuid('id')->middleware('permission:web_connector.form.delete')->name('forms.destroy');

    // Documentos legales por marca y su flujo de versiones (borrador → publicada → reemplazada).
    Route::get('legal-documents', [LegalDocumentController::class, 'index'])->middleware('permission:web_connector.legal_document.view')->name('legal-documents.index');
    Route::post('legal-documents', [LegalDocumentController::class, 'store'])->middleware(['permission:web_connector.legal_document.create', 'idempotency:optional'])->name('legal-documents.store');
    Route::prefix('legal-documents/{id}')->whereUuid('id')->name('legal-documents.')->group(function (): void {
        Route::get('/', [LegalDocumentController::class, 'show'])->middleware('permission:web_connector.legal_document.view')->name('show');
        Route::patch('/', [LegalDocumentController::class, 'update'])->middleware('permission:web_connector.legal_document.update')->name('update');
        Route::delete('/', [LegalDocumentController::class, 'destroy'])->middleware('permission:web_connector.legal_document.delete')->name('destroy');
        Route::post('versions', [LegalDocumentController::class, 'storeVersion'])->middleware(['permission:web_connector.legal_document.create', 'idempotency:optional'])->name('versions.store');
        Route::patch('versions/{vid}', [LegalDocumentController::class, 'updateVersion'])->whereUuid('vid')->middleware('permission:web_connector.legal_document.update')->name('versions.update');
        Route::delete('versions/{vid}', [LegalDocumentController::class, 'destroyVersion'])->whereUuid('vid')->middleware('permission:web_connector.legal_document.delete')->name('versions.destroy');
        Route::post('versions/{vid}/publish', [LegalDocumentController::class, 'publishVersion'])->whereUuid('vid')->middleware('permission:web_connector.legal_document.approve')->name('versions.publish');
    });
});

// API de lectura del plugin: primero el token del sitio (fija marca y organización), luego el límite por token.
Route::prefix('public/wp')->name('public.wp.')->middleware(['wp.site', 'throttle:wp-plugin'])->group(function (): void {
    Route::get('site', [WpPublicController::class, 'site'])->name('site');
    Route::get('catalog/categories', [WpPublicController::class, 'categories'])->name('catalog.categories');
    Route::get('catalog/plans', [WpPublicController::class, 'plans'])->name('catalog.plans');
    Route::get('catalog/plans/{id}', [WpPublicController::class, 'plan'])->whereUuid('id')->name('catalog.plans.show');
    Route::get('catalog/servers', [WpPublicController::class, 'servers'])->name('catalog.servers');
    Route::get('catalog/bundles/{id}', [WpPublicController::class, 'bundle'])->where('id', '[A-Za-z0-9][A-Za-z0-9_-]{0,80}')->name('catalog.bundles.show');
    Route::get('status', [WpPublicController::class, 'status'])->name('status');
    Route::get('catalog/promotions', [WpPublicController::class, 'promotions'])->name('catalog.promotions');
    Route::get('contact', [WpPublicController::class, 'contact'])->name('contact');
    Route::get('catalog/compare', [WpPublicController::class, 'compare'])->name('catalog.compare');
    Route::get('catalog/domain-prices', [WpPublicController::class, 'domainPrices'])->name('catalog.domain-prices');
    // Disponibilidad con RDAP/WHOIS públicos (D-35); límite por IP del visitante en el controlador.
    Route::get('domains/availability', [WpDomainAvailabilityController::class, 'show'])->name('domains.availability');
    Route::get('legal-documents/{slug}', [WpPublicController::class, 'legalDocument'])->where('slug', '[a-z0-9]+([_-][a-z0-9]+)*')->name('legal-documents.show');
    Route::get('forms/{code}', [WpPublicController::class, 'form'])->where('code', '[a-z0-9]+(-[a-z0-9]+)*')->name('forms.show');
    // Envío en modo reenvío del plugin (docs/13 §9); el límite por IP del visitante va en el controlador.
    Route::post('forms/{code}/submissions', [WpFormSubmissionController::class, 'store'])->where('code', '[a-z0-9]+(-[a-z0-9]+)*')->name('forms.submissions.store');
    // Libro de Reclamaciones público: registrar una hoja y consultar su estado por el código de la constancia.
    Route::post('complaints', [WpComplaintController::class, 'store'])->name('complaints.store');
    Route::get('complaints/{code}', [WpComplaintController::class, 'status'])->where('code', '[A-Za-z0-9][A-Za-z0-9_-]{0,80}')->name('complaints.status');
    // Preflight CORS del widget embebible (docs/15 §4): refleja el origen solicitado.
    // La pertenencia a allowed_origins se exige en la petición real (403 origin_not_allowed).
    Route::options('{any}', function (\Illuminate\Http\Request $request) {
        $response = response()->noContent();
        $origin = trim((string) $request->header('Origin', ''));
        if ($origin !== '') {
            $response->headers->set('Access-Control-Allow-Origin', $origin);
            $response->headers->set('Vary', 'Origin');
            $response->headers->set('Access-Control-Allow-Methods', 'GET, POST');
            $response->headers->set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
        }

        return $response;
    })->where('any', '.*')->name('preflight');
});

// Portal del cliente: documentos legales vigentes de su marca y su aceptación.
Route::prefix('portal')->name('portal.')->middleware(['hub.auth', 'user.type:customer'])->group(function (): void {
    Route::get('legal-documents', [PortalLegalController::class, 'index'])->middleware('permission:portal.legal_document.view')->name('legal-documents.index');
    Route::post('legal-acceptances', [PortalLegalController::class, 'accept'])->middleware(['permission:portal.legal_acceptance.create', 'idempotency:optional'])->name('legal-acceptances.store');
});
