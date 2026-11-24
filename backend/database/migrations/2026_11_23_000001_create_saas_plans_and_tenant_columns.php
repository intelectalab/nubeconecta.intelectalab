<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Multitenancy Fase 1 — capa de datos del módulo Tenancy.
 *
 * - `saas_plans`: planes que la empresa operadora vende a sus inquilinos
 *   (precio + límites). Propiedad de la organización operadora.
 * - `organizations`: columnas de suscripción SaaS por inquilino: si es la
 *   operadora (`is_operator`), su plan (`saas_plan_id`), estado de la
 *   suscripción (`saas_status`) y próxima renovación (`saas_renewal_date`).
 *
 * El esquema canónico database/schema.sql ya refleja ambas. Idempotente. Solo
 * PostgreSQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }

        $db->unprepared(<<<'SQL'
            CREATE TABLE IF NOT EXISTS saas_plans (
                id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id  uuid NOT NULL REFERENCES organizations(id),
                code             text NOT NULL,
                name             text NOT NULL,
                price_minor      bigint NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
                currency         char(3) NOT NULL DEFAULT 'PEN' CHECK (currency IN ('PEN','USD')),
                max_staff_users  integer NULL CHECK (max_staff_users IS NULL OR max_staff_users > 0),
                max_customers    integer NULL CHECK (max_customers   IS NULL OR max_customers   > 0),
                max_services     integer NULL CHECK (max_services    IS NULL OR max_services    > 0),
                status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
                version          integer NOT NULL DEFAULT 1 CHECK (version >= 1),
                created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
                created_by uuid NULL, updated_by uuid NULL,
                deleted_at timestamptz NULL,
                UNIQUE (organization_id, code)
            );

            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS is_operator       boolean NOT NULL DEFAULT false;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS saas_plan_id      uuid NULL;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS saas_status       text NULL;
            ALTER TABLE organizations ADD COLUMN IF NOT EXISTS saas_renewal_date date NULL;
            SQL);

        // Constraints en sentencias aparte: IF NOT EXISTS no aplica a CHECK/FK;
        // se agregan solo si faltan (idempotencia manual).
        $hasStatusCheck = $db->selectOne("SELECT 1 FROM pg_constraint WHERE conname = 'organizations_saas_status_check'");
        if ($hasStatusCheck === null) {
            $db->unprepared("ALTER TABLE organizations ADD CONSTRAINT organizations_saas_status_check CHECK (saas_status IS NULL OR saas_status IN ('trial','active','suspended','cancelled'));");
        }

        $hasPlanFk = $db->selectOne("SELECT 1 FROM pg_constraint WHERE conname = 'organizations_saas_plan_id_fkey'");
        if ($hasPlanFk === null) {
            $db->unprepared('ALTER TABLE organizations ADD CONSTRAINT organizations_saas_plan_id_fkey FOREIGN KEY (saas_plan_id) REFERENCES saas_plans(id);');
        }

        // La organización existente (la primera) es la operadora.
        $db->statement("UPDATE organizations SET is_operator = true WHERE is_operator = false AND id = (SELECT id FROM organizations ORDER BY created_at, id LIMIT 1);");
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared(<<<'SQL'
            ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_saas_plan_id_fkey;
            ALTER TABLE organizations DROP CONSTRAINT IF EXISTS organizations_saas_status_check;
            ALTER TABLE organizations DROP COLUMN IF EXISTS saas_renewal_date;
            ALTER TABLE organizations DROP COLUMN IF EXISTS saas_status;
            ALTER TABLE organizations DROP COLUMN IF EXISTS saas_plan_id;
            ALTER TABLE organizations DROP COLUMN IF EXISTS is_operator;
            DROP TABLE IF EXISTS saas_plans;
            SQL);
    }
};
