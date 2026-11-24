<?php

declare(strict_types=1);

namespace App\Modules\Identity\Database\Seeders;

use App\Modules\Identity\Models\Organization;
use App\Modules\Identity\Models\Permission;
use App\Modules\Identity\Models\Role;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Permisos (catálogo global) y roles del sistema desde database/seeds/
 * permissions.json y roles.json (docs/05 §1). Idempotente: se puede correr
 * cuantas veces haga falta; los roles del sistema quedan exactamente con los
 * permisos que resultan de expandir sus patrones (permissions → deny).
 * Los roles personalizados no se tocan.
 */
final class IdentitySeeder extends Seeder
{
    public function run(): void
    {
        $seeds = rtrim((string) config('hub.seeds_path'), '/\\');
        $permissions = self::json("{$seeds}/permissions.json")['permissions'];
        $roles = self::json("{$seeds}/roles.json");

        DB::transaction(function () use ($permissions, $roles): void {
            $sensitive = $roles['mfa_recent']['permissions'] ?? [];
            $this->seedPermissions($permissions, $sensitive);

            $catalog = Permission::query()->pluck('id', 'code')->all();
            $organization = Organization::ensureDefault();
            // Multitenancy Fase 1: la organización por defecto es la operadora.
            if (! $organization->is_operator) {
                $organization->forceFill(['is_operator' => true])->save();
            }
            $this->seedRolesForOrganization($organization->id, $roles['roles'], $catalog);
        });
    }

    /**
     * Siembra los roles de sistema de una organización (inquilino) ya existente.
     * El catálogo de permisos es global y debe estar sembrado antes (run()).
     * Lo usa el módulo Tenancy al crear un inquilino (multitenancy Fase 1).
     * Idempotente.
     */
    public function seedRolesFor(string $organizationId): void
    {
        $seeds = rtrim((string) config('hub.seeds_path'), '/\\');
        $roles = self::json("{$seeds}/roles.json")['roles'];
        $catalog = Permission::query()->pluck('id', 'code')->all();
        if ($catalog === []) {
            throw new RuntimeException('Siembra el catálogo de permisos (IdentitySeeder::run) antes de los roles del inquilino.');
        }

        DB::transaction(fn () => $this->seedRolesForOrganization($organizationId, $roles, $catalog));
    }

    /**
     * @param  list<array<string, mixed>>  $roles
     * @param  array<string, string>  $catalog  code => id
     */
    private function seedRolesForOrganization(string $organizationId, array $roles, array $catalog): void
    {
        app(CurrentOrganization::class)->set($organizationId);

        foreach ($roles as $definition) {
            $this->seedRole($organizationId, $definition, $catalog);
        }
    }

    /** @param list<array<string, mixed>> $permissions */
    private function seedPermissions(array $permissions, array $sensitive): void
    {
        foreach ($permissions as $p) {
            if (substr_count($p['code'], '.') !== 2) {
                throw new RuntimeException("Permiso con formato inválido: {$p['code']}");
            }
            [$module, $entity, $action] = explode('.', $p['code']);
            $permission = Permission::query()->firstOrNew(['code' => $p['code']]);
            $permission->fill([
                // `module` guarda la clave del módulo (prefijo del código), no el código IDN/BIL.
                'module' => $p['module_key'] ?? $module,
                'entity' => $p['entity'] ?? $entity,
                'action' => $p['action'] ?? $action,
                'description' => $p['description'] ?? null,
                'is_sensitive' => in_array($p['code'], $sensitive, true),
            ]);
            if ($permission->isDirty()) {
                $permission->save();
            }
        }

        $unknown = array_diff($sensitive, array_column($permissions, 'code'));
        if ($unknown !== []) {
            throw new RuntimeException('mfa_recent menciona permisos inexistentes: '.implode(', ', $unknown));
        }
    }

    /**
     * @param  array<string, mixed>  $definition
     * @param  array<string, string>  $catalog  code => id
     */
    private function seedRole(string $organizationId, array $definition, array $catalog): void
    {
        $audience = $definition['type'];
        $name = is_array($definition['name']) ? ($definition['name']['es'] ?? reset($definition['name'])) : $definition['name'];

        $role = Role::query()->firstOrNew(['code' => $definition['code']]);
        if (! $role->exists) {
            $role->forceFill(['organization_id' => $organizationId, 'audience' => $audience, 'is_system' => (bool) $definition['system']]);
        }
        $role->name = $name;
        if ($role->isDirty()) {
            $role->save();
        }

        $allowGlobal = in_array($definition['code'], ['admin', 'superadmin'], true);
        $granted = self::expand($definition['permissions'], array_keys($catalog), $definition['code'], $allowGlobal);
        $denied = self::expand($definition['deny'] ?? [], array_keys($catalog), $definition['code'], false);
        $codes = array_diff($granted, $denied);

        // El trigger hub_role_permission_audience() exige: cliente ⇔ portal.*.
        $codes = array_filter($codes, fn (string $c) => ($audience === 'customer') === str_starts_with($c, 'portal.'));

        $role->syncPermissionIds(array_values(array_map(fn (string $c) => $catalog[$c], $codes)));
    }

    /**
     * Expande patrones (`*`, `mod.*`, `mod.*.view`, `*.*.delete`) contra el catálogo.
     * Un patrón sin coincidencias hace fallar el seeder (docs/05 §1).
     *
     * @param  list<string>  $patterns
     * @param  list<string>  $codes
     * @return list<string>
     */
    public static function expand(array $patterns, array $codes, string $role, bool $allowGlobal): array
    {
        $out = [];
        foreach ($patterns as $pattern) {
            if ($pattern === '*' && ! $allowGlobal) {
                throw new RuntimeException("El comodín global '*' solo se permite en admin/superadmin (rol {$role}).");
            }
            $parts = $pattern === '*' ? ['*', '*', '*'] : explode('.', $pattern);
            if (count($parts) === 2 && $parts[1] === '*') {
                $parts[] = '*';
            }
            if (count($parts) !== 3) {
                throw new RuntimeException("Patrón inválido '{$pattern}' en el rol {$role}.");
            }
            $regex = '/^'.implode('\.', array_map(fn ($s) => $s === '*' ? '[a-z_]+' : preg_quote($s, '/'), $parts)).'$/';
            $matches = preg_grep($regex, $codes);
            if ($matches === [] || $matches === false) {
                throw new RuntimeException("El patrón '{$pattern}' del rol {$role} no coincide con ningún permiso.");
            }
            array_push($out, ...array_values($matches));
        }

        return array_values(array_unique($out));
    }

    /** @return array<string, mixed> */
    private static function json(string $path): array
    {
        if (! is_file($path)) {
            throw new RuntimeException("No se encontró {$path} (HUB_SEEDS_PATH).");
        }

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }
}
