<?php

declare(strict_types=1);

use App\Modules\Inventory\Http\Controllers\HostingAccountController;
use App\Modules\Inventory\Http\Controllers\HostingNodeController;
use App\Modules\Inventory\Http\Controllers\ResourceController;
use App\Modules\Inventory\Http\Controllers\ServerController;
use Illuminate\Support\Facades\Route;

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('resources', [ResourceController::class, 'index'])->middleware('permission:inventory.resource.view')->name('resources.index');
    Route::post('resources', [ResourceController::class, 'store'])->middleware('permission:inventory.resource.create')->name('resources.store');
    Route::get('resources/{id}', [ResourceController::class, 'show'])->whereUuid('id')->middleware('permission:inventory.resource.view')->name('resources.show');
    Route::patch('resources/{id}', [ResourceController::class, 'update'])->whereUuid('id')->middleware('permission:inventory.resource.update')->name('resources.update');
    Route::delete('resources/{id}', [ResourceController::class, 'destroy'])->whereUuid('id')->middleware('permission:inventory.resource.delete')->name('resources.destroy');
    Route::get('servers', [ServerController::class, 'index'])->middleware('permission:inventory.server.view')->name('servers.index');
    Route::post('servers', [ServerController::class, 'store'])->middleware('permission:inventory.server.create')->name('servers.store');
    Route::get('servers/{id}', [ServerController::class, 'show'])->whereUuid('id')->middleware('permission:inventory.server.view')->name('servers.show');
    Route::patch('servers/{id}', [ServerController::class, 'update'])->whereUuid('id')->middleware('permission:inventory.server.update')->name('servers.update');
    Route::delete('servers/{id}', [ServerController::class, 'destroy'])->whereUuid('id')->middleware('permission:inventory.server.delete')->name('servers.destroy');
    Route::get('hosting-nodes', [HostingNodeController::class, 'index'])->middleware('permission:inventory.hosting_node.view')->name('hosting-nodes.index');
    Route::post('hosting-nodes', [HostingNodeController::class, 'store'])->middleware('permission:inventory.hosting_node.create')->name('hosting-nodes.store');
    Route::get('hosting-nodes/{id}', [HostingNodeController::class, 'show'])->whereUuid('id')->middleware('permission:inventory.hosting_node.view')->name('hosting-nodes.show');
    Route::patch('hosting-nodes/{id}', [HostingNodeController::class, 'update'])->whereUuid('id')->middleware('permission:inventory.hosting_node.update')->name('hosting-nodes.update');
    Route::delete('hosting-nodes/{id}', [HostingNodeController::class, 'destroy'])->whereUuid('id')->middleware('permission:inventory.hosting_node.delete')->name('hosting-nodes.destroy');
    Route::get('hosting-accounts', [HostingAccountController::class, 'index'])->middleware('permission:inventory.hosting_account.view')->name('hosting-accounts.index');
    Route::post('hosting-accounts', [HostingAccountController::class, 'store'])->middleware('permission:inventory.hosting_account.create')->name('hosting-accounts.store');
    Route::get('hosting-accounts/{id}', [HostingAccountController::class, 'show'])->whereUuid('id')->middleware('permission:inventory.hosting_account.view')->name('hosting-accounts.show');
    Route::patch('hosting-accounts/{id}', [HostingAccountController::class, 'update'])->whereUuid('id')->middleware('permission:inventory.hosting_account.update')->name('hosting-accounts.update');
    Route::delete('hosting-accounts/{id}', [HostingAccountController::class, 'destroy'])->whereUuid('id')->middleware('permission:inventory.hosting_account.delete')->name('hosting-accounts.destroy');
});
