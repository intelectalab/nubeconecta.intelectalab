<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * database/schema.sql concede permisos al rol `hub_app` solo sobre las tablas
 * que existen al cargarlo. Las tablas de infraestructura de Laravel que crean
 * las migraciones de serie (sesiones, caché, colas) se crean después, así que
 * se conceden aquí para que el usuario de conexión de la aplicación (que hereda
 * de `hub_app`) pueda usarlas. Solo PostgreSQL y solo si el rol existe.
 */
return new class extends Migration
{
    private array $tables = [
        'password_reset_tokens', 'sessions',
        'cache', 'cache_locks',
        'jobs', 'job_batches', 'failed_jobs',
    ];

    public function up(): void
    {
        $db = DB::connection($this->getConnection());

        if ($db->getDriverName() !== 'pgsql') {
            return;
        }

        if (! $db->selectOne("select 1 as ok from pg_roles where rolname = 'hub_app'")) {
            return;
        }

        foreach ($this->tables as $table) {
            if ($db->getSchemaBuilder()->hasTable($table)) {
                $db->statement("GRANT SELECT, INSERT, UPDATE, DELETE ON {$table} TO hub_app");
            }
        }

        foreach (['jobs_id_seq', 'failed_jobs_id_seq'] as $sequence) {
            if ($db->selectOne('select 1 as ok from pg_class where relkind = ? and relname = ?', ['S', $sequence])) {
                $db->statement("GRANT USAGE, SELECT ON SEQUENCE {$sequence} TO hub_app");
            }
        }
    }

    public function down(): void
    {
        //
    }
};
