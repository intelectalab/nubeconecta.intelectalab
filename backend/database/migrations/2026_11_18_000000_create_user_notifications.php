<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Feed persistente de notificaciones in-app por usuario del personal (campana del
 * header). Idempotente y solo PostgreSQL. Cada usuario lee únicamente las suyas.
 */
return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection($this->getConnection());

        if ($db->getDriverName() !== 'pgsql') {
            return;
        }

        $db->statement(<<<'SQL'
            CREATE TABLE IF NOT EXISTS user_notifications (
                id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                organization_id uuid NOT NULL REFERENCES organizations(id),
                user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                type            text NOT NULL,
                title           text NOT NULL,
                body            text NULL,
                link            text NULL,
                read_at         timestamptz NULL,
                created_at      timestamptz NOT NULL DEFAULT now()
            )
        SQL);
        $db->statement('CREATE INDEX IF NOT EXISTS user_notifications_org_user_created_idx ON user_notifications (organization_id, user_id, created_at)');
        $db->statement('CREATE INDEX IF NOT EXISTS user_notifications_unread_idx ON user_notifications (user_id) WHERE read_at IS NULL');

        if ($db->selectOne("select 1 as ok from pg_roles where rolname = 'hub_app'")) {
            $db->statement('GRANT SELECT, INSERT, UPDATE, DELETE ON user_notifications TO hub_app');
        }
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());

        if ($db->getDriverName() === 'pgsql') {
            $db->statement('DROP TABLE IF EXISTS user_notifications');
        }
    }
};
