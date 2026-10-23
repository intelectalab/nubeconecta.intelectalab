<?php

declare(strict_types=1);

namespace App\Modules\Customers\Services;

use Illuminate\Support\Facades\DB;

/**
 * Tablas que apuntan a `customers` por llave foránea (servicios, dominios,
 * facturas, tickets, contratos...), leídas del catálogo de PostgreSQL. Así la
 * fusión y la ficha 360° cubren los módulos de schema.sql sin depender de sus
 * clases (los módulos dueños aún no exponen interfaces públicas).
 */
final class RelatedRecords
{
    /** Tablas que la fusión no mueve: la propia jerarquía de fusión. */
    private const SKIP = ['customers.merged_into_id'];

    /** Tablas de solo inserción (trigger hub_forbid_mutation): conservan el cliente original. */
    public const IMMUTABLE = [
        'audit_events', 'secret_access_logs', 'setting_changes', 'notification_deliveries', 'webhook_events',
        'notification_delivery_events', 'webhook_event_processings', 'ai_messages',
        'legal_acceptances', 'lead_stage_changes', 'complaint_deletions', 'rich_text_versions', 'complaint_responses', 'whois_lookups',
    ];

    /** @var list<array{table: string, column: string}>|null */
    private ?array $memo = null;

    /** @return list<array{table: string, column: string}> */
    public function references(): array
    {
        return $this->memo ??= array_values(array_filter(array_map(
            fn ($r): array => ['table' => $r->table_name, 'column' => $r->column_name],
            DB::select(<<<'SQL'
                SELECT c.conrelid::regclass::text AS table_name, a.attname AS column_name
                  FROM pg_constraint c
                  JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
                 WHERE c.contype = 'f' AND c.confrelid = 'customers'::regclass AND array_length(c.conkey, 1) = 1
                 ORDER BY 1, 2
            SQL),
        ), fn (array $r): bool => ! in_array($r['table'].'.'.$r['column'], self::SKIP, true)));
    }

    /**
     * Conteo por tabla de los registros del cliente (borrados lógicos excluidos si la tabla los tiene).
     *
     * @return array<string, int>
     */
    public function counts(string $customerId): array
    {
        $out = [];
        foreach ($this->references() as $ref) {
            $q = DB::table($ref['table'])->where($ref['column'], $customerId);
            if ($this->hasColumn($ref['table'], 'deleted_at')) {
                $q->whereNull('deleted_at');
            }
            $key = $ref['column'] === 'customer_id' ? $ref['table'] : $ref['table'].'.'.$ref['column'];
            $out[$key] = (int) $q->count();
        }

        return $out;
    }

    public function hasColumn(string $table, string $column): bool
    {
        static $cache = [];

        return $cache["{$table}.{$column}"] ??= DB::selectOne(
            'select exists(select 1 from information_schema.columns where table_schema = current_schema() and table_name = ? and column_name = ?) as ok',
            [$table, $column],
        )->ok;
    }
}
