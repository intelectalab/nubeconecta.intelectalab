<?php

declare(strict_types=1);

use App\Modules\Tenancy\Http\Controllers\SaasPlanController;
use App\Modules\Tenancy\Http\Controllers\TenantController;
use Illuminate\Support\Facades\Route;

/**
 * Gestión de la plataforma SaaS por el operador (multitenancy Fase 1).
 * `operator` restringe a la organización operadora; los permisos `tenancy.*`
 * los tiene solo el superadministrador (el admin los tiene denegados).
 */
Route::prefix('admin/tenancy')->name('admin.tenancy.')
    ->middleware(['hub.auth', 'user.type:staff', 'operator'])
    ->group(function (): void {
        Route::get('tenants', [TenantController::class, 'index'])->middleware('permission:tenancy.tenant.view')->name('tenants.index');
        Route::post('tenants', [TenantController::class, 'store'])->middleware(['permission:tenancy.tenant.create', 'idempotency:optional'])->name('tenants.store');
        Route::get('tenants/{id}', [TenantController::class, 'show'])->whereUuid('id')->middleware('permission:tenancy.tenant.view')->name('tenants.show');
        Route::post('tenants/{id}/suspend', [TenantController::class, 'suspend'])->whereUuid('id')->middleware('permission:tenancy.tenant.update')->name('tenants.suspend');
        Route::post('tenants/{id}/reactivate', [TenantController::class, 'reactivate'])->whereUuid('id')->middleware('permission:tenancy.tenant.update')->name('tenants.reactivate');
        Route::patch('tenants/{id}/plan', [TenantController::class, 'changePlan'])->whereUuid('id')->middleware('permission:tenancy.tenant.update')->name('tenants.plan');
        Route::post('tenants/{id}/renew', [TenantController::class, 'renew'])->whereUuid('id')->middleware('permission:tenancy.tenant.update')->name('tenants.renew');

        Route::get('plans', [SaasPlanController::class, 'index'])->middleware('permission:tenancy.plan.view')->name('plans.index');
        Route::post('plans', [SaasPlanController::class, 'store'])->middleware('permission:tenancy.plan.manage')->name('plans.store');
        Route::patch('plans/{id}', [SaasPlanController::class, 'update'])->whereUuid('id')->middleware('permission:tenancy.plan.manage')->name('plans.update');
        Route::post('plans/{id}/archive', [SaasPlanController::class, 'archive'])->whereUuid('id')->middleware('permission:tenancy.plan.manage')->name('plans.archive');
    });
