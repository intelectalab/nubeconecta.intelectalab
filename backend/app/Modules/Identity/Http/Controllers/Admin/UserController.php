<?php

declare(strict_types=1);

namespace App\Modules\Identity\Http\Controllers\Admin;

use App\Modules\Identity\Services\PrivilegeGuard;
use App\Modules\Identity\Services\SystemAdminGuard;
use App\Models\User;
use App\Modules\Identity\Http\Resources\UserResource;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\AuthSessionManager;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Shared\Audit\AuditLogger;
use App\Shared\Concurrency\VersionGuard;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Pagination\CursorPagination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Arr;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/** /api/v1/admin/users (permisos identity.user.*). */
final class UserController
{
    private const AUDITED = ['name', 'email', 'type', 'status', 'locale', 'timezone', 'disabled_at', 'must_change_password'];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly PrivilegeGuard $privileges,
    ) {}

    public function index(Request $request): JsonResponse
    {
        $query = User::query()->with('roles');

        if ($type = $request->input('filter.type')) {
            $query->where('type', $type);
        }
        if ($status = $request->input('filter.status')) {
            $query->where('status', $status);
        }
        if (is_string($q = $request->input('filter.q')) && $q !== '') {
            $like = '%'.addcslashes(mb_strtolower($q), '%_\\').'%';
            $query->where(fn ($w) => $w->whereRaw('lower(name) like ?', [$like])->orWhereRaw('lower(email) like ?', [$like]));
        }

        return CursorPagination::respond($query, $request, ['created_at', 'name', 'email', 'last_login_at'], UserResource::class);
    }

    public function store(Request $request, SecurityPolicy $policy): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:200'],
            'email' => ['required', 'string', 'email', 'max:255'],
            'type' => ['required', Rule::in(['staff', 'customer'])],
            'password' => ['required', 'string', 'max:1024', $policy->passwordRule()],
            'locale' => ['sometimes', Rule::in(['es', 'en'])],
            'timezone' => ['sometimes', 'timezone:all'],
            'role_ids' => ['sometimes', 'array'],
            'role_ids.*' => ['uuid'],
        ]);
        $this->assertEmailFree($data['email']);

        $user = DB::transaction(function () use ($data): User {
            $user = new User(Arr::only($data, ['name', 'email', 'type', 'locale', 'timezone']));
            $user->forceFill([
                'password_hash' => Hash::make($data['password']),
                'password_changed_at' => now(),
                'must_change_password' => true, // contraseña puesta por el administrador
            ])->save();

            $this->syncRoles($user, array_map(fn ($id) => ['id' => $id], $data['role_ids'] ?? []));
            $this->audit->record('user.created', 'user', $user->id, null, $this->snapshot($user));

            return $user;
        });

        return (new UserResource($user->load('roles')))->response()->setStatusCode(201);
    }

    public function show(User $user): UserResource
    {
        return new UserResource($user->load('roles'));
    }

    public function update(Request $request, User $user): UserResource
    {
        $this->privileges->assertCanManage($request->user(), $user);
        $data = $request->validate([
            'version' => ['required', 'integer'],
            'name' => ['sometimes', 'string', 'max:200'],
            'email' => ['sometimes', 'string', 'email', 'max:255'],
            'locale' => ['sometimes', Rule::in(['es', 'en'])],
            'timezone' => ['sometimes', 'timezone:all'],
        ]);
        if (isset($data['email']) && mb_strtolower($data['email']) !== mb_strtolower($user->email)) {
            $this->assertEmailFree($data['email']);
        }

        DB::transaction(function () use ($user, $data): void {
            VersionGuard::check($user, $data['version']);
            $before = $this->snapshot($user);
            $user->fill(Arr::except($data, ['version']))->save();
            $this->audit->record('user.updated', 'user', $user->id, $before, $this->snapshot($user));
        });

        return new UserResource($user->refresh()->load('roles'));
    }

    public function disable(Request $request, User $user, AuthSessionManager $sessions): UserResource
    {
        $this->privileges->assertCanManage($request->user(), $user);
        $this->assertNotSelf($request, $user);

        DB::transaction(function () use ($user, $sessions): void {
            $before = $this->snapshot($user);
            $user->forceFill(['status' => 'disabled', 'disabled_at' => now()])->save();
            app(SystemAdminGuard::class)->assertActiveAdminRemains();
            $revoked = $sessions->revokeAll($user);
            $this->audit->record('user.disabled', 'user', $user->id, $before, $this->snapshot($user), ['revoked_sessions' => $revoked]);
        });

        return new UserResource($user->refresh()->load('roles'));
    }

    public function enable(Request $request, User $user): UserResource
    {
        $this->privileges->assertCanManage($request->user(), $user);
        DB::transaction(function () use ($user): void {
            $before = $this->snapshot($user);
            $user->forceFill(['status' => 'active', 'disabled_at' => null, 'locked_until' => null, 'failed_login_count' => 0])->save();
            $this->audit->record('user.enabled', 'user', $user->id, $before, $this->snapshot($user));
        });

        return new UserResource($user->refresh()->load('roles'));
    }

    public function destroy(Request $request, User $user, AuthSessionManager $sessions): Response
    {
        $this->privileges->assertCanManage($request->user(), $user);
        $this->assertNotSelf($request, $user);

        DB::transaction(function () use ($user, $sessions): void {
            $before = $this->snapshot($user);
            $user->delete();
            app(SystemAdminGuard::class)->assertActiveAdminRemains();
            $sessions->revokeAll($user);
            $this->audit->record('user.deleted', 'user', $user->id, $before, null);
        });

        return response()->noContent();
    }

    public function updateRoles(Request $request, User $user): UserResource
    {
        $this->privileges->assertCanManage($request->user(), $user);
        $data = $request->validate([
            'roles' => ['present', 'array'],
            'roles.*.id' => ['required', 'uuid'],
            'roles.*.expires_at' => ['nullable', 'date', 'after:now'],
        ]);

        DB::transaction(function () use ($user, $data): void {
            $before = $user->roles()->pluck('roles.code')->sort()->values()->all();
            $this->syncRoles($user, $data['roles']);
            app(SystemAdminGuard::class)->assertActiveAdminRemains();
            $after = $user->roles()->pluck('roles.code')->sort()->values()->all();
            $this->audit->record('user.roles_updated', 'user', $user->id, ['roles' => $before], ['roles' => $after]);
        });

        return new UserResource($user->refresh()->load('roles'));
    }

    /** @param list<array{id: string, expires_at?: ?string}> $roles */
    private function syncRoles(User $user, array $roles): void
    {
        $ids = array_column($roles, 'id');
        $found = Role::query()->whereIn('id', $ids)->get()->keyBy('id');

        foreach ($roles as $i => $item) {
            $role = $found->get($item['id']);
            if ($role === null) {
                throw ValidationException::withMessages(["roles.{$i}.id" => [__('validation.exists', ['attribute' => 'role'])]]);
            }
            if ($role->audience !== $user->type) {
                throw ValidationException::withMessages(["roles.{$i}.id" => ["El rol {$role->code} es de audiencia {$role->audience} y el usuario es {$user->type}."]]);
            }
        }

        // Solo los roles nuevos o renovados: quitar o mantener uno vigente no otorga nada.
        // Un rol vencido (técnico temporal) cuenta como nuevo: reactivarlo o ampliar su
        // vigencia sí otorga, así que pasa por el chequeo anti escalada.
        $current = $user->roles()
            ->where(fn ($q) => $q->whereNull('user_roles.expires_at')->orWhere('user_roles.expires_at', '>', now()))
            ->get()
            ->filter(function (Role $role) use ($roles): bool {
                $requested = collect($roles)->firstWhere('id', $role->id);
                $old = $role->pivot->expires_at;

                return $old === null
                    || ($requested !== null && ($requested['expires_at'] ?? null) !== null
                        && \Illuminate\Support\Carbon::parse($requested['expires_at'])->lte(\Illuminate\Support\Carbon::parse($old)));
            })
            ->pluck('id')
            ->all();
        $actor = auth()->user();
        if ($actor instanceof User) {
            $this->privileges->assertCanAssignRoles($actor, $found->except($current)->values());
        }

        $sync = [];
        foreach ($roles as $item) {
            $sync[$item['id']] = [
                'organization_id' => $user->organization_id,
                'expires_at' => $item['expires_at'] ?? null,
                'created_by' => auth()->id(),
            ];
        }
        $user->roles()->sync($sync);
        $user->forgetPermissionCache();
    }

    private function assertEmailFree(string $email): void
    {
        if (User::query()->whereRaw('lower(email) = ?', [mb_strtolower($email)])->exists()) {
            throw ValidationException::withMessages(['email' => [__('validation.unique', ['attribute' => 'email'])]]);
        }
    }

    private function assertNotSelf(Request $request, User $user): void
    {
        if ($request->user()?->getAuthIdentifier() === $user->id) {
            throw new ProblemException(409, 'conflict', 'No puede deshabilitar ni borrar su propio usuario.');
        }
    }

    /** @return array<string, mixed> */
    private function snapshot(User $user): array
    {
        return Arr::only($user->attributesToArray(), self::AUDITED);
    }
}
