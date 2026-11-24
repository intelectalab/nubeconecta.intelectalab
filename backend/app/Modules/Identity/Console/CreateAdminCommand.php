<?php

declare(strict_types=1);

namespace App\Modules\Identity\Console;

use App\Models\User;
use App\Modules\Identity\Database\Seeders\IdentitySeeder;
use App\Modules\Identity\Models\Organization;
use App\Modules\Identity\Models\Role;
use App\Modules\Identity\Services\SecurityPolicy;
use App\Shared\Audit\AuditLogger;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Validator;
use Illuminate\Support\Str;

/**
 * Crea el superadministrador inicial (cuenta break-glass, acceso total). No hay
 * contraseña fija: se pide por consola (oculta, dos veces), se lee de la variable
 * indicada en --password-env, o se genera con --generate y se muestra una sola vez.
 * Siempre queda must_change_password = true y deberá enrolar MFA al entrar.
 */
final class CreateAdminCommand extends Command
{
    protected $signature = 'hub:create-superadmin
        {email : Correo del superadministrador}
        {--name= : Nombre visible (por defecto la parte local del correo)}
        {--password-env= : Nombre de una variable de entorno con la contraseña}
        {--generate : Genera una contraseña aleatoria y la muestra una vez}';

    protected $description = 'Crea el usuario superadministrador inicial (rol superadmin) sin contraseñas fijas';

    public function handle(SecurityPolicy $policy, AuditLogger $audit, CurrentOrganization $current): int
    {
        $email = mb_strtolower(trim((string) $this->argument('email')));
        if (Validator::make(['email' => $email], ['email' => 'required|email'])->fails()) {
            $this->error('Correo inválido.');

            return self::FAILURE;
        }

        if (! Role::withoutGlobalScopes()->where('code', 'superadmin')->exists()) {
            $this->info('Cargando roles y permisos (IdentitySeeder)...');
            $this->callSilently('db:seed', ['--class' => IdentitySeeder::class, '--force' => true]);
        }

        $organization = Organization::ensureDefault();
        $current->set($organization->id);

        // Multitenancy Fase 1: el correo es único en todo el sistema.
        if (User::query()->withoutGlobalScope('organization')->whereRaw('lower(email) = ?', [$email])->exists()) {
            $this->error("Ya existe un usuario con el correo {$email}.");

            return self::FAILURE;
        }

        $password = $this->resolvePassword($policy);
        if ($password === null) {
            return self::FAILURE;
        }

        $user = DB::transaction(function () use ($email, $password, $organization, $audit): User {
            $user = new User(['name' => $this->option('name') ?: Str::before($email, '@'), 'email' => $email, 'type' => 'staff']);
            $user->forceFill([
                'organization_id' => $organization->id,
                'password_hash' => Hash::make($password),
                'password_changed_at' => now(),
                'must_change_password' => true,
            ])->save();

            $role = Role::query()->where('code', 'superadmin')->firstOrFail();
            $user->roles()->attach($role->id, ['organization_id' => $organization->id]);

            $audit->record('user.created', 'user', $user->id, null, ['email' => $email, 'roles' => ['superadmin']], ['source' => 'hub:create-superadmin'], actor: ['type' => 'system', 'id' => null]);

            return $user;
        });

        $this->info("Superadministrador creado: {$user->email} ({$user->id}). Deberá cambiar la contraseña y activar MFA al entrar.");

        return self::SUCCESS;
    }

    private function resolvePassword(SecurityPolicy $policy): ?string
    {
        if ($this->option('generate')) {
            $password = Str::password(20);
            $this->warn("Contraseña generada (se muestra una sola vez): {$password}");

            return $password;
        }

        if ($var = $this->option('password-env')) {
            $password = (string) getenv((string) $var);
        } else {
            $password = (string) $this->secret('Contraseña');
            if ($password !== (string) $this->secret('Repita la contraseña')) {
                $this->error('Las contraseñas no coinciden.');

                return null;
            }
        }

        $validator = Validator::make(['password' => $password], ['password' => ['required', $policy->passwordRule()]]);
        if ($validator->fails()) {
            foreach ($validator->errors()->all() as $message) {
                $this->error($message);
            }

            return null;
        }

        return $password;
    }
}
