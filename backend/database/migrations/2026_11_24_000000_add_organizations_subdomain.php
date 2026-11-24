<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Multitenancy Fase 2: subdominio por inquilino. El host
 * `<subdomain>.<HUB_TENANT_BASE_DOMAIN>` resuelve la organización antes del
 * login (branding por inquilino) — ver App\Modules\Identity\Http\Middleware\
 * ResolveTenantFromHost. Único (parcial) y en minúsculas.
 *
 * El esquema canónico database/schema.sql ya refleja la columna. Idempotente.
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
        $db->unprepared("ALTER TABLE organizations ADD COLUMN IF NOT EXISTS subdomain text NULL;");
        if ($db->selectOne("SELECT 1 FROM pg_constraint WHERE conname = 'organizations_subdomain_format'") === null) {
            $db->unprepared("ALTER TABLE organizations ADD CONSTRAINT organizations_subdomain_format CHECK (subdomain IS NULL OR subdomain ~ '^[a-z0-9][a-z0-9-]{0,40}$');");
        }
        $db->unprepared("CREATE UNIQUE INDEX IF NOT EXISTS organizations_subdomain_uq ON organizations (subdomain) WHERE subdomain IS NOT NULL AND deleted_at IS NULL;");
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared('DROP INDEX IF EXISTS organizations_subdomain_uq;');
        $db->unprepared('ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_subdomain_format;');
        $db->unprepared('ALTER TABLE organizations DROP COLUMN IF EXISTS subdomain;');
    }
};
