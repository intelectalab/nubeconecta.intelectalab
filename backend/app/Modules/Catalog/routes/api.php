<?php

declare(strict_types=1);

use App\Modules\Catalog\Http\Controllers\PlanController;
use App\Modules\Catalog\Http\Controllers\PlanPriceController;
use App\Modules\Catalog\Http\Controllers\ProductCategoryController;
use App\Modules\Catalog\Http\Controllers\ProductController;
use App\Modules\Catalog\Http\Controllers\ProductListingController;
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
});
