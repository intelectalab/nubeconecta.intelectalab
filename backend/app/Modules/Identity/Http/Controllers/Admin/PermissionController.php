<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers\Admin;

use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/** /api/v1/admin/permissions y la matriz por módulo y acción (identity.permission.view). */
final class PermissionController
{
    public function index(Request $request): JsonResponse
    {
        $query = Permission::query()->orderBy('code');
        if ($module = $request->input('filter.module')) {
            $query->where('module', $module);
        }

        return response()->json(['data' => $query->get(['id', 'code', 'module', 'entity', 'action', 'description', 'is_sensitive'])]);
    }

    public function matrix(): JsonResponse
    {
        $modules = Permission::query()->orderBy('code')->get(['code', 'module', 'entity', 'action', 'is_sensitive'])
            ->groupBy('module')
            ->map(fn ($perms, $module) => [
                'module' => $module,
                'entities' => $perms->groupBy('entity')->map(fn ($items, $entity) => [
                    'entity' => $entity,
                    'actions' => $items->map(fn ($p) => ['code' => $p->code, 'action' => $p->action, 'is_sensitive' => $p->is_sensitive])->values(),
                ])->values(),
            ])->values();

        $roles = Role::query()->with('permissions:id,code')->orderBy('code')->get()
            ->map(fn (Role $r) => [
                'id' => $r->id, 'code' => $r->code, 'name' => $r->name, 'audience' => $r->audience,
                'is_system' => $r->is_system, 'version' => $r->version,
                'permissions' => $r->permissions->pluck('code')->sort()->values(),
            ]);

        return response()->json(['data' => ['modules' => $modules, 'roles' => $roles]]);
    }
}
