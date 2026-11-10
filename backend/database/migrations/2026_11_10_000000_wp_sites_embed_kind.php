<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Widget embebible v1.7 (docs/15): lleva una BD ya cargada al esquema nuevo de
 * `wp_sites`/`wp_site_tokens`. El esquema canónico `database/schema.sql` ya
 * refleja estos cambios; esta migración los aplica a instalaciones existentes
 * (donde `0000_..load_canonical_schema` es no-op porque `users` ya existe).
 *
 * - Columna `wp_sites.kind` ('wordpress'|'embed'), por defecto 'wordpress'.
 * - El CHECK de sitio activo acepta `kind='embed'` (el widget no usa webhook).
 * - CHECK nuevo: un sitio embed exige ≥1 origen permitido y sin webhook.
 * - `wp_site_tokens.scope` admite 'embed' (clave publicable del navegador).
 *
 * Idempotente: en una BD fresca (pruebas) el esquema ya trae todo; los
 * DROP ... IF EXISTS + ADD vuelven a dejar las mismas restricciones.
 * Solo actúa en PostgreSQL; en SQLite no hace nada.
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
            ALTER TABLE wp_sites ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'wordpress';

            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_kind_check;
            ALTER TABLE wp_sites ADD CONSTRAINT wp_sites_kind_check
                CHECK (kind IN ('wordpress','embed'));

            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_check;
            ALTER TABLE wp_sites ADD CONSTRAINT wp_sites_check
                CHECK (status <> 'active' OR kind = 'embed' OR (webhook_url IS NOT NULL AND webhook_secret_id IS NOT NULL));

            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_embed_check;
            ALTER TABLE wp_sites ADD CONSTRAINT wp_sites_embed_check
                CHECK (kind <> 'embed' OR (cardinality(allowed_origins) >= 1 AND webhook_url IS NULL));

            ALTER TABLE wp_site_tokens DROP CONSTRAINT IF EXISTS wp_site_tokens_scope_check;
            ALTER TABLE wp_site_tokens ADD CONSTRAINT wp_site_tokens_scope_check
                CHECK (scope IN ('read','embed'));
        SQL);
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }

        $db->unprepared(<<<'SQL'
            ALTER TABLE wp_site_tokens DROP CONSTRAINT IF EXISTS wp_site_tokens_scope_check;
            ALTER TABLE wp_site_tokens ADD CONSTRAINT wp_site_tokens_scope_check
                CHECK (scope IN ('read'));

            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_embed_check;
            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_kind_check;

            ALTER TABLE wp_sites DROP CONSTRAINT IF EXISTS wp_sites_check;
            ALTER TABLE wp_sites ADD CONSTRAINT wp_sites_check
                CHECK (status <> 'active' OR (webhook_url IS NOT NULL AND webhook_secret_id IS NOT NULL));

            ALTER TABLE wp_sites DROP COLUMN IF EXISTS kind;
        SQL);
    }
};
