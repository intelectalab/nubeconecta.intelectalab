<?php

declare(strict_types=1);

use App\Modules\Catalog\Http\Controllers\PlanController;
use App\Modules\Catalog\Http\Controllers\PlanPriceController;
use App\Modules\Catalog\Http\Controllers\BundleItemController;
use App\Modules\Catalog\Http\Controllers\ProductCategoryController;
use App\Modules\Catalog\Http\Controllers\ProductController;
use App\Modules\Catalog\Http\Controllers\ProductAddonController;
use App\Modules\Catalog\Http\Controllers\ProductListingController;
use App\Modules\Catalog\Http\Controllers\ServiceTypeController;
use App\Modules\Catalog\Http\Controllers\ServiceTypeFieldController;
use App\Modules\Catalog\Http\Controllers\HostingSpecController;
use App\Modules\Catalog\Http\Controllers\VpsSpecController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Catalog (M-CAT, franja MVP), cargadas por CatalogServiceProvider
| bajo /api/v1 con el grupo `api` (nombres api.v1.*).
*/

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    $crud = static function (string $path, string $controller, string $permission): void {
        Route::get($path, [$controller, 'index'])->middleware("permission:{$permission}.view")->name("{$path}.index");
        Route::post($path, [$controller, 'store'])->middleware(["permission:{$permission}.create", 'idempotency:optional'])->name("{$path}.store");
        Route::get("{$path}/{id}", [$controller, 'show'])->whereUuid('id')->middleware("permission:{$permission}.view")->name("{$path}.show");
        Route::patch("{$path}/{id}", [$controller, 'update'])->whereUuid('id')->middleware("permission:{$permission}.update")->name("{$path}.update");
        Route::delete("{$path}/{id}", [$controller, 'destroy'])->whereUuid('id')->middleware("permission:{$permission}.delete")->name("{$path}.destroy");
    };

    $crud('product-categories', ProductCategoryController::class, 'catalog.product_category');
    $crud('products', ProductController::class, 'catalog.product');
    $crud('plans', PlanController::class, 'catalog.plan');
    $crud('plan-prices', PlanPriceController::class, 'catalog.plan_price');
    $crud('product-listings', ProductListingController::class, 'catalog.product_listing');
    $crud('service-types', ServiceTypeController::class, 'catalog.service_type');

    Route::post('service-types/{id}/activate', [ServiceTypeController::class, 'activate'])->whereUuid('id')->middleware('permission:catalog.service_type.update')->name('service-types.activate');
    Route::post('service-types/{id}/archive', [ServiceTypeController::class, 'archive'])->whereUuid('id')->middleware('permission:catalog.service_type.update')->name('service-types.archive');
    Route::get('service-types/{id}/fields', [ServiceTypeFieldController::class, 'index'])->whereUuid('id')->middleware('permission:catalog.service_type.view')->name('service-types.fields.index');
    Route::post('service-types/{id}/fields', [ServiceTypeFieldController::class, 'store'])->whereUuid('id')->middleware(['permission:catalog.service_type.update', 'idempotency:optional'])->name('service-types.fields.store');
    Route::patch('service-types/{id}/fields/{field}', [ServiceTypeFieldController::class, 'update'])->whereUuid('id')->whereUuid('field')->middleware('permission:catalog.service_type.update')->name('service-types.fields.update');
    Route::delete('service-types/{id}/fields/{field}', [ServiceTypeFieldController::class, 'destroy'])->whereUuid('id')->whereUuid('field')->middleware('permission:catalog.service_type.update')->name('service-types.fields.destroy');

    Route::get('products/{id}/addons', [ProductAddonController::class, 'index'])->whereUuid('id')->middleware('permission:catalog.product.view')->name('products.addons.index');
    Route::post('products/{id}/addons', [ProductAddonController::class, 'store'])->whereUuid('id')->middleware(['permission:catalog.product.update', 'idempotency:optional'])->name('products.addons.store');
    Route::patch('products/{id}/addons/{addon}', [ProductAddonController::class, 'update'])->whereUuid('id')->whereUuid('addon')->middleware('permission:catalog.product.update')->name('products.addons.update');
    Route::delete('products/{id}/addons/{addon}', [ProductAddonController::class, 'destroy'])->whereUuid('id')->whereUuid('addon')->middleware('permission:catalog.product.update')->name('products.addons.destroy');

    Route::get('products/{id}/hosting-spec', [HostingSpecController::class, 'show'])->whereUuid('id')->middleware('permission:catalog.product.view')->name('products.hosting-spec.show');
    Route::put('products/{id}/hosting-spec', [HostingSpecController::class, 'upsert'])->whereUuid('id')->middleware('permission:catalog.product.update')->name('products.hosting-spec.upsert');
    Route::delete('products/{id}/hosting-spec', [HostingSpecController::class, 'destroy'])->whereUuid('id')->middleware('permission:catalog.product.update')->name('products.hosting-spec.destroy');
    Route::get('products/{id}/vps-spec', [VpsSpecController::class, 'show'])->whereUuid('id')->middleware('permission:catalog.product.view')->name('products.vps-spec.show');
    Route::put('products/{id}/vps-spec', [VpsSpecController::class, 'upsert'])->whereUuid('id')->middleware('permission:catalog.product.update')->name('products.vps-spec.upsert');
    Route::delete('products/{id}/vps-spec', [VpsSpecController::class, 'destroy'])->whereUuid('id')->middleware('permission:catalog.product.update')->name('products.vps-spec.destroy');

    Route::get('plans/{id}/bundle-items', [BundleItemController::class, 'index'])->whereUuid('id')->middleware('permission:catalog.plan.view')->name('plans.bundle-items.index');
    Route::post('plans/{id}/bundle-items', [BundleItemController::class, 'store'])->whereUuid('id')->middleware(['permission:catalog.plan.update', 'idempotency:optional'])->name('plans.bundle-items.store');
    Route::patch('plans/{id}/bundle-items/{item}', [BundleItemController::class, 'update'])->whereUuid('id')->whereUuid('item')->middleware('permission:catalog.plan.update')->name('plans.bundle-items.update');
    Route::delete('plans/{id}/bundle-items/{item}', [BundleItemController::class, 'destroy'])->whereUuid('id')->whereUuid('item')->middleware('permission:catalog.plan.update')->name('plans.bundle-items.destroy');
});
