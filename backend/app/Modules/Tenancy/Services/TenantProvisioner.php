<?php

declare(strict_types=1);

namespace App\Modules\Tenancy\Services;

use App\Models\User;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Identity\Models\Organization;
use App\Modules\Identity\Models\Role;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * Alta de un inquilino (multitenancy Fase 1): crea su organización, siembra sus
 * roles de sistema y crea su primer administrador. El catálogo de permisos es
 * global (ya sembrado por IdentitySeeder::run).
 *
 * Durante el alta se cambia la organización operadora de la petición a la del
 * inquilino nuevo (para sembrar roles y crear el admin en su contexto) y se
 * restaura siempre la del operador al terminar.
 */
final class TenantProvisioner
{
    public function __construct(
        private readonly CurrentOrganization $current,
        private readonly IdentitySeeder $seeder,
    ) {}

    /**
     * @param  array{name:string,slug:string,country?:string,saas_plan_id?:?string,saas_renewal_date?:?string,admin_name:string,admin_email:string}  $data
     * @return array{organization:Organization,admin:User,temporary_password:string}
     */
    public function create(array $data): array
    {
        $operatorOrgId = $this->current->idOrNull();

        try {
            return DB::transaction(function () use ($data): array {
                $organization = Organization::query()->create([
                    'name' => $data['name'],
                    'slug' => $data['slug'],
                    'country' => $data['country'] ?? 'PE',
                    'is_operator' => false,
                    'saas_plan_id' => $data['saas_plan_id'] ?? null,
                    'saas_status' => 'active',
                    'saas_renewal_date' => $data['saas_renewal_date'] ?? null,
                ]);

                // Siembra los roles de sistema del inquilino (fija CurrentOrganization al nuevo).
                $this->seeder->seedRolesFor($organization->id);

                // Primer administrador del inquilino. Contraseña temporal de un solo uso:
                // debe cambiarla al entrar (must_change_password) y enrolar 2FA.
                $temporaryPassword = Str::password(16);
                $admin = new User(['name' => $data['admin_name'], 'email' => $data['admin_email'], 'type' => 'staff']);
                $admin->forceFill([
                    'organization_id' => $organization->id,
                    'password_hash' => Hash::make($temporaryPassword),
                    'password_changed_at' => now(),
                    'must_change_password' => true,
                ])->save();

                $adminRole = Role::query()->withoutGlobalScope('organization')
                    ->where('organization_id', $organization->id)->where('code', 'admin')->firstOrFail();
                $admin->roles()->attach($adminRole->id, ['organization_id' => $organization->id]);

                return ['organization' => $organization, 'admin' => $admin, 'temporary_password' => $temporaryPassword];
            });
        } finally {
            // Restaura el contexto del operador pase lo que pase (éxito o excepción).
            $this->current->set($operatorOrgId);
        }
    }
}
