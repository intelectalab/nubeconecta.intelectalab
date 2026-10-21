<?php

declare(strict_types=1);

use App\Modules\Brands\Http\Controllers\BankAccountController;
use App\Modules\Brands\Http\Controllers\BrandController;
use App\Modules\Brands\Http\Controllers\BrandThemeController;
use App\Modules\Brands\Http\Controllers\DocumentSeriesController;
use App\Modules\Brands\Http\Controllers\LegalEntityController;
use App\Modules\Brands\Http\Controllers\PublicBrandThemeController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Brands (M-BRD), cargadas por BrandsServiceProvider bajo
| /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    $crud = static function (string $path, string $controller, string $permission, bool $delete = true): void {
        Route::get($path, [$controller, 'index'])->middleware("permission:{$permission}.view")->name("{$path}.index");
        Route::post($path, [$controller, 'store'])->middleware("permission:{$permission}.create")->name("{$path}.store");
        Route::get("{$path}/{id}", [$controller, 'show'])->whereUuid('id')->middleware("permission:{$permission}.view")->name("{$path}.show");
        Route::patch("{$path}/{id}", [$controller, 'update'])->whereUuid('id')->middleware("permission:{$permission}.update")->name("{$path}.update");
        if ($delete) {
            Route::delete("{$path}/{id}", [$controller, 'destroy'])->whereUuid('id')->middleware("permission:{$permission}.delete")->name("{$path}.destroy");
        }
    };

    $crud('legal-entities', LegalEntityController::class, 'brands.legal_entity');
    $crud('brands', BrandController::class, 'brands.brand');
    $crud('bank-accounts', BankAccountController::class, 'brands.bank_account');
    $crud('document-series', DocumentSeriesController::class, 'brands.document_series');

    Route::get('brand-themes', [BrandThemeController::class, 'index'])->middleware('permission:brands.theme.view')->name('brand-themes.index');
    Route::post('brand-themes', [BrandThemeController::class, 'store'])->middleware('permission:brands.theme.create')->name('brand-themes.store');
    Route::get('brand-themes/{id}', [BrandThemeController::class, 'show'])->whereUuid('id')->middleware('permission:brands.theme.view')->name('brand-themes.show');
    Route::post('brand-themes/{id}/versions', [BrandThemeController::class, 'storeVersion'])->whereUuid('id')->middleware('permission:brands.theme.create')->name('brand-themes.versions.store');

    Route::prefix('brand-theme-versions/{id}')->whereUuid('id')->name('brand-theme-versions.')->group(function (): void {
        Route::get('/', [BrandThemeController::class, 'showVersion'])->middleware('permission:brands.theme.view')->name('show');
        Route::patch('/', [BrandThemeController::class, 'updateVersion'])->middleware('permission:brands.theme.update')->name('update');
        Route::post('check-contrast', [BrandThemeController::class, 'checkContrast'])->middleware('permission:brands.theme.update')->name('check-contrast');
        Route::post('preview-link', [BrandThemeController::class, 'previewLink'])->middleware('permission:brands.theme.update')->name('preview-link');
        Route::post('publish', [BrandThemeController::class, 'publish'])->middleware(['permission:brands.theme.approve', 'idempotency:optional'])->name('publish');
        Route::post('revert', [BrandThemeController::class, 'revert'])->middleware(['permission:brands.theme.approve', 'idempotency:optional'])->name('revert');
    });
});

Route::prefix('public')->name('public.')->middleware('throttle:60,1')->group(function (): void {
    Route::get('brand-themes/{brand}', [PublicBrandThemeController::class, 'show'])->where('brand', '[a-z][a-z0-9_-]{1,39}')->name('brand-themes.show');
    Route::get('brand-theme-previews/{token}', [PublicBrandThemeController::class, 'preview'])->where('token', '[A-Za-z0-9]{48}')->name('brand-theme-previews.show');
});
