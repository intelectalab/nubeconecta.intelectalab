<?php

declare(strict_types=1);

namespace App\Shared\Console;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Crea o actualiza el usuario de conexión restringido de la aplicación: un rol
 * LOGIN que hereda de `hub_app` (permisos DML del esquema canónico, sin DDL,
 * sin ser dueño de tablas, con los REVOKE de solo inserción) y sin atributos de
 * administración. Se ejecuta con el usuario dueño (hub_owner) después de
 * `migrate`. La contraseña nunca está en el repositorio: se lee de
 * HUB_DB_APP_PASSWORD. Desarrollo puede seguir usando hub_owner.
 */
final class CreateAppDatabaseUserCommand extends Command
{
    protected $signature = 'hub:db:app-user {--username= : Nombre del rol (por defecto HUB_DB_APP_USERNAME o hub_app_login)}';

    protected $description = 'Crea o actualiza el usuario de BD restringido (LOGIN, hereda de hub_app); contraseña desde HUB_DB_APP_PASSWORD';

    public function handle(): int
    {
        $db = DB::connection();
        if ($db->getDriverName() !== 'pgsql') {
            $this->error('Solo PostgreSQL.');

            return self::FAILURE;
        }
        $username = (string) ($this->option('username') ?: config('hub.database.app_username', 'hub_app_login'));
        $password = (string) config('hub.database.app_password', '');
        if (preg_match('/^[a-z_][a-z0-9_]{0,62}$/', $username) !== 1 || in_array($username, ['hub_app', 'hub_owner', 'postgres'], true)) {
            $this->error('Nombre de usuario inválido (minúsculas, dígitos y _; distinto de hub_app, hub_owner y postgres).');

            return self::FAILURE;
        }
        if (mb_strlen($password) < 16) {
            $this->error('Defina HUB_DB_APP_PASSWORD con al menos 16 caracteres.');

            return self::FAILURE;
        }
        if (! $db->selectOne("select 1 as ok from pg_roles where rolname = 'hub_app'")) {
            $this->error('No existe el rol hub_app: cargue primero el esquema (php artisan migrate).');

            return self::FAILURE;
        }

        // DDL de roles no admite parámetros: identificador validado arriba y literal citado por PDO.
        // Se usa PDO directamente para que la contraseña no pase por los eventos de consulta.
        $pdo = $db->getPdo();
        $exists = (bool) $db->selectOne('select 1 as ok from pg_roles where rolname = ?', [$username]);
        $attributes = 'LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '.$pdo->quote($password);
        $pdo->exec(($exists ? 'ALTER' : 'CREATE')." ROLE \"{$username}\" {$attributes}");
        $pdo->exec("GRANT hub_app TO \"{$username}\"");
        $database = (string) $db->getDatabaseName();
        $pdo->exec('GRANT CONNECT ON DATABASE "'.str_replace('"', '""', $database)."\" TO \"{$username}\"");

        $this->info(($exists ? 'Actualizado' : 'Creado')." el usuario {$username} (hereda de hub_app). Configure DB_USERNAME={$username} en la aplicación.");

        return self::SUCCESS;
    }
}
