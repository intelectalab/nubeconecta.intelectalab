<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Índices de performance para las consultas agregadas del panel (revisión
 * 2026-11-13). No urgentes con datos pequeños, pero baratos:
 *  - payments(organization_id, received_at) WHERE status='validated': el flujo
 *    "cobrado" mensual y el desglose por medio de pago (CashflowController).
 *  - domains(organization_id, status) y (organization_id, provider_account_id),
 *    parciales sobre deleted_at IS NULL: filtros del listado de dominios.
 * Idempotente (IF NOT EXISTS), solo PostgreSQL. Reflejado en database/schema.sql.
 */
return new class extends Migration
{
    private array $statements = [
        "CREATE INDEX IF NOT EXISTS payments_org_received_validated_idx ON payments (organization_id, received_at) WHERE status = 'validated'",
        'CREATE INDEX IF NOT EXISTS domains_org_status_idx ON domains (organization_id, status) WHERE deleted_at IS NULL',
        'CREATE INDEX IF NOT EXISTS domains_org_provider_account_idx ON domains (organization_id, provider_account_id) WHERE deleted_at IS NULL',
    ];

    public function up(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        foreach ($this->statements as $sql) {
            $db->statement($sql);
        }
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        foreach (['payments_org_received_validated_idx', 'domains_org_status_idx', 'domains_org_provider_account_idx'] as $idx) {
            $db->statement("DROP INDEX IF EXISTS {$idx}");
        }
    }
};
