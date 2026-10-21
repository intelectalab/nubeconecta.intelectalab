<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers\Admin;

use App\Modules\Identity\Services\PrivilegeGuard;
use App\Modules\Identity\Http\Resources\RoleResource;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** /api/v1/admin/roles (permisos identity.role.*). Roles del sistema protegidos (RN-IDN-008). */
final class RoleController
{
    private const CODE_RULE = 'regex:/^[a-z][a-z0-9_]{1,62}$/';

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly PrivilegeGuard $privileges,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = Role::query();
        if ($audience = $request->input('filter.audience')) {
            $query->where('audience', $audience);
        }

        return CursorPagination::respond($query, $request, ['code', 'name', 'created_at'], RoleResource::class, 'code');
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', self::CODE_RULE],
            'name' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
            'audience' => ['required', Rule::in(['staff', 'customer'])],
            'permissions' => ['sometimes', 'array'],
            'permissions.*' => ['string'],
        ]);
        $this->assertCodeFree($data['code']);
        $this->permissionIds($data['permissions'] ?? [], $data['audience']); // 422 antes que 403
        $this->privileges->assertCanGrant($request->user(), $data['permissions'] ?? []);

        $role = DB::transaction(function () use ($data): Role {
            $role = Role::query()->create(Arr::except($data, ['permissions']));
            $role->syncPermissionIds($this->permissionIds($data['permissions'] ?? [], $role->audience));
            $this->audit->record('role.created', 'role', $role->id, null, $this->snapshot($role));

            return $role;
        });

        return (new RoleResource($role->load('permissions')))->response()->setStatusCode(201);
    }

    public function show(Role $role): RoleResource
    {
        return new RoleResource($role->load('permissions'));
    }

    public function update(Request $request, Role $role): RoleResource
    {
        $this->privileges->assertCanAssignRoles($request->user(), [$role]);
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'code' => ['sometimes', 'string', self::CODE_RULE],
            'name' => ['sometimes', 'string', 'max:200'],
            'description' => ['sometimes', 'nullable', 'string', 'max:2000'],
        ]);
        if (isset($data['code']) && $data['code'] !== $role->code) {
            if ($role->is_system) {
                throw new ProblemException(409, 'system_role_protected');
            }
            $this->assertCodeFree($data['code']);
        }

        DB::transaction(function () use ($role, $data): void {
            VersionGuard::check($role, $data['version']);
            $before = $this->snapshot($role);
            $role->fill(Arr::except($data, ['version']))->save();
            $this->audit->record('role.updated', 'role', $role->id, $before, $this->snapshot($role));
        });

        return new RoleResource($role->refresh()->load('permissions'));
    }

    public function destroy(Request $request, Role $role): Response
    {
        $this->privileges->assertCanAssignRoles($request->user(), [$role]);
        if ($role->is_system) {
            throw new ProblemException(409, 'system_role_protected');
        }
        if (DB::table('user_roles')->where('role_id', $role->id)->exists()) {
            throw new ProblemException(409, 'conflict', 'El rol tiene usuarios asignados; quíteselo antes de borrarlo.');
        }

        DB::transaction(function () use ($role): void {
            $before = $this->snapshot($role);
            $role->delete();
            $this->audit->record('role.deleted', 'role', $role->id, $before, null);
        });

        return response()->noContent();
    }

    public function copy(Request $request, Role $role): JsonResponse
    {
        $data = $request->validate([
            'code' => ['required', 'string', self::CODE_RULE],
            'name' => ['required', 'string', 'max:200'],
            'description' => ['nullable', 'string', 'max:2000'],
        ]);
        $this->assertCodeFree($data['code']);
        $this->privileges->assertCanAssignRoles($request->user(), [$role]);

        $copy = DB::transaction(function () use ($role, $data): Role {
            $copy = new Role($data + ['audience' => $role->audience]);
            $copy->copied_from_role_id = $role->id;
            $copy->save();
            $copy->syncPermissionIds($role->permissions()->pluck('permissions.id')->all());
            $this->audit->record('role.copied', 'role', $copy->id, null, $this->snapshot($copy), ['copied_from_role_id' => $role->id]);

            return $copy;
        });

        return (new RoleResource($copy->load('permissions')))->response()->setStatusCode(201);
    }

    public function updatePermissions(Request $request, Role $role): RoleResource
    {
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'permissions' => ['present', 'array'],
            'permissions.*' => ['string'],
        ]);

        DB::transaction(function () use ($request, $role, $data): void {
            VersionGuard::check($role, $data['version']);
            $before = $role->permissions()->pluck('permissions.code')->sort()->values()->all();
            $ids = $this->permissionIds($data['permissions'], $role->audience); // 422 antes que 403
            // Quitar también exige tenerlo: nadie recorta permisos que no administra (p. ej. vaciar el rol admin).
            $this->privileges->assertCanGrant($request->user(), array_merge(
                array_diff($data['permissions'], $before),
                array_diff($before, $data['permissions']),
            ));
            $role->syncPermissionIds($ids);
            $role->touch(); // version +1: la matriz cambió
            $after = $role->permissions()->pluck('permissions.code')->sort()->values()->all();
            $this->audit->record('role.permissions_updated', 'role', $role->id, ['permissions' => $before], ['permissions' => $after], [
                'added' => array_values(array_diff($after, $before)),
                'removed' => array_values(array_diff($before, $after)),
            ]);
        });

        return new RoleResource($role->refresh()->load('permissions'));
    }

    /**
     * @param  list<string>  $codes
     * @return list<string>
     */
    private function permissionIds(array $codes, string $audience): array
    {
        $codes = array_values(array_unique($codes));
        $found = Permission::query()->whereIn('code', $codes)->pluck('id', 'code');

        $errors = [];
        foreach ($codes as $i => $code) {
            if (! $found->has($code)) {
                $errors["permissions.{$i}"] = ["El permiso {$code} no existe."];
            } elseif (($audience === 'customer') !== str_starts_with($code, 'portal.')) {
                $errors["permissions.{$i}"] = ["El permiso {$code} no corresponde a un rol de audiencia {$audience}."];
            }
        }
        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        return $found->values()->all();
    }

    private function assertCodeFree(string $code): void
    {
        if (Role::query()->where('code', $code)->exists()) {
            throw ValidationException::withMessages(['code' => [__('validation.unique', ['attribute' => 'code'])]]);
        }
    }

    /** @return array<string, mixed> */
    private function snapshot(Role $role): array
    {
        return Arr::only($role->attributesToArray(), ['code', 'name', 'description', 'audience', 'is_system', 'copied_from_role_id']);
    }
}
