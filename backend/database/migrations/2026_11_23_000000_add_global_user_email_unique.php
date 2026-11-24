<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Multitenancy Fase 1 (Opción A): el correo de un usuario es único en TODO el
 * sistema, no solo dentro de su organización. Esto permite resolver el inquilino
 * a partir del correo en el login (sin subdominio ni selector): se busca el
 * correo en todas las organizaciones, se encuentra al usuario y de ahí sale su
 * organización. Limitación documentada: un mismo correo no puede pertenecer a
 * dos inquilinos a la vez.
 *
 * El índice por organización (users_org_email_uq) se conserva; este índice global
 * es más estricto y lo implica. El esquema canónico database/schema.sql ya lo
 * refleja; esta migración lo aplica a instalaciones existentes. Idempotente.
 * Solo PostgreSQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared('CREATE UNIQUE INDEX IF NOT EXISTS users_global_email_uq ON users (lower(email)) WHERE deleted_at IS NULL;');
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared('DROP INDEX IF EXISTS users_global_email_uq;');
    }
};
