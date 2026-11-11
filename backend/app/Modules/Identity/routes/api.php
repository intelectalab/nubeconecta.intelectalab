<?php

declare(strict_types=1);

use App\Modules\Identity\Http\Controllers\Admin\PermissionController;
use App\Modules\Identity\Http\Controllers\Admin\RoleController;
use App\Modules\Identity\Http\Controllers\Admin\UserController;
use App\Modules\Identity\Http\Controllers\AuthController;
use App\Modules\Identity\Http\Controllers\MfaController;
use App\Modules\Identity\Http\Controllers\PortalCredentialController;
use App\Modules\Identity\Http\Controllers\PublicBrandingController;
use Illuminate\Support\Facades\Route;

/*
| Rutas del módulo Identity. Las carga IdentityServiceProvider con el grupo
| `api` y el prefijo /api/v1 (nombres api.v1.*).
*/

Route::prefix('auth')->name('auth.')->group(function (): void {
    Route::post('login', [AuthController::class, 'login'])->middleware('throttle:identity-login')->name('login');
    Route::post('mfa/verify', [AuthController::class, 'verifyMfa'])->middleware('throttle:identity-login')->name('mfa.verify');

    Route::middleware('hub.auth')->group(function (): void {
        Route::post('logout', [AuthController::class, 'logout'])->name('logout');
        Route::get('me', [AuthController::class, 'me'])->name('me');
        Route::get('password-policy', [AuthController::class, 'passwordPolicy'])->name('password-policy');
        Route::post('password/change', [AuthController::class, 'changePassword'])->middleware('throttle:identity-mfa')->name('password.change');
        Route::post('mfa/totp', [MfaController::class, 'startTotp'])->name('mfa.totp.start');
        Route::post('mfa/totp/confirm', [MfaController::class, 'confirmTotp'])->middleware('throttle:identity-mfa')->name('mfa.totp.confirm');
        Route::delete('mfa/totp', [MfaController::class, 'disableTotp'])->middleware('mfa.recent')->name('mfa.totp.disable');
        Route::post('mfa/step-up', [MfaController::class, 'stepUp'])->middleware(['throttle:identity-login', 'throttle:identity-mfa'])->name('mfa.step-up');
    });
});

// Branding del login (un solo login global), anónimo pre-login: lo consume el portal.
Route::prefix('public')->name('public.')->group(function (): void {
    Route::get('login-branding', [PublicBrandingController::class, 'loginBranding'])->middleware('throttle:public-branding')->name('login-branding');
});

// Públicas del portal: activar la cuenta con invitación y recuperar la contraseña.
Route::prefix('portal/auth')->name('portal.auth.')->group(function (): void {
    Route::get('password-policy', [AuthController::class, 'passwordPolicy'])->middleware('throttle:identity-token-check')->name('password-policy');
    Route::post('invitations/verify', [PortalCredentialController::class, 'verifyInvitation'])->middleware('throttle:identity-token-check')->name('invitations.verify');
    Route::post('invitations/accept', [PortalCredentialController::class, 'acceptInvitation'])->middleware('throttle:identity-token-use')->name('invitations.accept');
    Route::post('password/forgot', [PortalCredentialController::class, 'forgot'])->middleware('throttle:identity-forgot')->name('password.forgot');
    Route::post('password/reset', [PortalCredentialController::class, 'reset'])->middleware('throttle:identity-token-use')->name('password.reset');
});

Route::prefix('admin')->name('admin.')->middleware(['hub.auth', 'user.type:staff'])->group(function (): void {
    Route::get('users', [UserController::class, 'index'])->middleware('permission:identity.user.view')->name('users.index');
    Route::post('users', [UserController::class, 'store'])->middleware('permission:identity.user.create')->name('users.store');
    Route::get('users/{user}', [UserController::class, 'show'])->middleware('permission:identity.user.view')->name('users.show');
    Route::patch('users/{user}', [UserController::class, 'update'])->middleware('permission:identity.user.update')->name('users.update');
    Route::delete('users/{user}', [UserController::class, 'destroy'])->middleware('permission:identity.user.delete')->name('users.destroy');
    Route::post('users/{user}/disable', [UserController::class, 'disable'])->middleware('permission:identity.user.update')->name('users.disable');
    Route::post('users/{user}/enable', [UserController::class, 'enable'])->middleware('permission:identity.user.update')->name('users.enable');
    Route::put('users/{user}/roles', [UserController::class, 'updateRoles'])->middleware('permission:identity.user.update')->name('users.roles');

    Route::get('roles', [RoleController::class, 'index'])->middleware('permission:identity.role.view')->name('roles.index');
    Route::post('roles', [RoleController::class, 'store'])->middleware('permission:identity.role.create')->name('roles.store');
    Route::get('roles/{role}', [RoleController::class, 'show'])->middleware('permission:identity.role.view')->name('roles.show');
    Route::patch('roles/{role}', [RoleController::class, 'update'])->middleware('permission:identity.role.update')->name('roles.update');
    Route::delete('roles/{role}', [RoleController::class, 'destroy'])->middleware('permission:identity.role.delete')->name('roles.destroy');
    Route::post('roles/{role}/copy', [RoleController::class, 'copy'])->middleware('permission:identity.role.create')->name('roles.copy');
    Route::put('roles/{role}/permissions', [RoleController::class, 'updatePermissions'])->middleware('permission:identity.role.update')->name('roles.permissions');

    Route::get('permissions', [PermissionController::class, 'index'])->middleware('permission:identity.permission.view')->name('permissions.index');
    Route::get('permissions/matrix', [PermissionController::class, 'matrix'])->middleware('permission:identity.permission.view')->name('permissions.matrix');
});
