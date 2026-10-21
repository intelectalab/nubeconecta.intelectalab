<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Migración base: carga el esquema canónico `database/schema.sql`
 * (203 tablas, docs/01-contrato-de-nombres.md) en PostgreSQL.
 *
 * - Solo actúa con el driver pgsql; en SQLite (pruebas) no hace nada y
 *   las migraciones de serie de Laravel crean sus propias tablas.
 * - Es idempotente: si la tabla `users` ya existe (p. ej. la cargó el
 *   initdb de Docker en el primer arranque del volumen), solo se registra
 *   como ejecutada.
 * - La ruta se puede cambiar con HUB_SCHEMA_PATH; por defecto es
 *   <repo>/database/schema.sql (en Docker se monta en /var/www/database).
 *
 * Los cambios posteriores del esquema van en migraciones nuevas y también
 * se reflejan en database/schema.sql (ver backend/README.md, "Estrategia
 * de esquema").
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection($this->getConnection())->getDriverName() !== 'pgsql') {
            return;
        }

        if (Schema::connection($this->getConnection())->hasTable('users')) {
            return;
        }

        $path = env('HUB_SCHEMA_PATH') ?: base_path('../database/schema.sql');

        if (! is_file($path)) {
            throw new RuntimeException("No se encontró el esquema canónico en [{$path}]. Defina HUB_SCHEMA_PATH.");
        }

        $db = DB::connection($this->getConnection());
        $db->unprepared(file_get_contents($path));

        // Al cargarse por aquí, la tabla de control de migraciones ya existe y el
        // "GRANT ... ON ALL TABLES" del esquema se la concede a hub_app. Se retira
        // para quedar igual que la carga por initdb (la app no toca esa tabla).
        $migrations = config('database.migrations.table', 'migrations');
        $migrations = is_array($migrations) ? ($migrations['table'] ?? 'migrations') : $migrations;
        $quoted = $db->getQueryGrammar()->wrapTable($migrations);
        $db->statement("REVOKE ALL ON {$quoted} FROM hub_app");
        if ($db->selectOne('select 1 as ok from pg_class where relkind = ? and relname = ?', ['S', "{$migrations}_id_seq"])) {
            $db->statement('REVOKE ALL ON SEQUENCE '.$db->getQueryGrammar()->wrapTable("{$migrations}_id_seq").' FROM hub_app');
        }
    }

    /**
     * Irreversible a propósito: borrar el esquema canónico por un rollback
     * destruiría todos los datos. Para empezar de cero use `migrate:fresh`
     * en un entorno de desarrollo.
     */
    public function down(): void
    {
        //
    }
};
