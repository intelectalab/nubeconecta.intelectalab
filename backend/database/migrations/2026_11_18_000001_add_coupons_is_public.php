<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Bandera `coupons.is_public`: solo los cupones marcados como públicos se
 * exponen en el bloque `promocion` del widget embebible / endpoint
 * `/public/wp/catalog/promotions`. Por defecto false para no filtrar cupones
 * privados o dirigidos (p. ej. descuentos de retención de un cliente).
 *
 * El esquema canónico `database/schema.sql` ya refleja la columna; esta
 * migración la aplica a instalaciones existentes (donde load_canonical_schema
 * es no-op). Idempotente. Solo PostgreSQL.
 */
return new class extends Migration
{
    public function up(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared('ALTER TABLE coupons ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;');
    }

    public function down(): void
    {
        $db = DB::connection($this->getConnection());
        if ($db->getDriverName() !== 'pgsql') {
            return;
        }
        $db->unprepared('ALTER TABLE coupons DROP COLUMN IF EXISTS is_public;');
    }
};
