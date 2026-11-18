<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Datos de ejemplo para los módulos comerciales/operación que quedaban vacíos
 * en la demo: Cotizaciones, Contratos y Tareas.
 *
 * - Idempotente: si ya existe una tarea demo (custom->>'demo'), no hace nada.
 * - Transaccional: todo o nada.
 * - Se enlaza a clientes/marca/staff reales existentes; numera con hub_next_code
 *   (COT-/CTR-/TAR-) para no chocar con datos reales.
 * - Marca contratos y tareas con custom = {"demo": true} para poder limpiarlos.
 *
 * Ejecutar explícitamente: php artisan db:seed --class=DemoSalesOpsSeeder
 * NO se incluye en DatabaseSeeder (no se siembra en cada deploy/test).
 */
final class DemoSalesOpsSeeder extends Seeder
{
    public function run(): void
    {
        $org = (string) DB::table('organizations')->value('id');
        if ($org === '') {
            $this->command?->warn('No hay organización; se omite DemoSalesOpsSeeder.');

            return;
        }
        if (DB::table('tasks')->whereRaw("custom->>'demo' = 'true'")->exists()) {
            $this->command?->info('DemoSalesOpsSeeder: los datos demo ya existen, no se hace nada.');

            return;
        }

        $brand = (string) DB::table('brands')->whereNull('deleted_at')->orderBy('created_at')->value('id');
        if ($brand === '') {
            $this->command?->warn('No hay marcas; se omite DemoSalesOpsSeeder.');

            return;
        }

        $staff = DB::table('users')->where('type', 'staff')->where('status', 'active')->orderBy('created_at')->pluck('id')->all();
        $staffId = static fn (int $i): ?string => $staff[$i % max(count($staff), 1)] ?? null;

        // Clientes demo (los creados por CoreDemoSeeder) para enlazar.
        $customers = DB::table('customers')->whereNull('deleted_at')
            ->where('code', 'like', 'DEMO-%')->orderBy('created_at')
            ->get(['id', 'code'])->all();
        if (count($customers) < 3) {
            // Respaldo: cualquier cliente existente.
            $customers = DB::table('customers')->whereNull('deleted_at')->orderBy('created_at')->limit(6)->get(['id', 'code'])->all();
        }
        if (count($customers) < 3) {
            $this->command?->warn('DemoSalesOpsSeeder: no hay suficientes clientes; se omite.');

            return;
        }
        $cust = static fn (int $i) => $customers[$i % count($customers)];

        $now = now();
        $today = Carbon::now();

        DB::transaction(function () use ($org, $brand, $now, $today, $cust, $staffId): void {
            $nextCode = function (string $entity, string $prefix) use ($org): string {
                DB::table('code_sequences')->insertOrIgnore([
                    'organization_id' => $org, 'entity' => $entity, 'prefix' => $prefix, 'padding' => 6, 'next_value' => 1,
                ]);

                return (string) DB::selectOne('select hub_next_code(?, ?) as code', [$org, $entity])->code;
            };

            // ---------------- COTIZACIONES ----------------
            // [customerIdx, status, oneTimeMinor, recurringMinor, validInDays, items[[desc, charge_type, cycle, qty, unit_minor]]]
            $quotes = [
                [0, 'accepted', 150000, 29900, 20, [['Migración e implementación inicial', 'one_time', null, 1, 150000], ['Hosting administrado Plan Pro', 'recurring', 'monthly', 1, 29900]]],
                [1, 'sent', 0, 49900, 15, [['Correo corporativo Google Workspace (10 cuentas)', 'recurring', 'monthly', 10, 4990]]],
                [2, 'sent', 80000, 19900, 10, [['Rediseño de sitio web', 'one_time', null, 1, 80000], ['Mantenimiento web mensual', 'recurring', 'monthly', 1, 19900]]],
                [3, 'draft', 0, 99900, 30, [['VPS dedicado 8 vCPU / 16 GB', 'recurring', 'monthly', 1, 99900]]],
                [4, 'rejected', 250000, 0, 5, [['Auditoría de seguridad e infraestructura', 'one_time', null, 1, 250000]]],
                [5, 'expired', 0, 14900, -3, [['Certificado SSL wildcard + soporte', 'recurring', 'annual', 1, 14900]]],
            ];
            foreach ($quotes as [$ci, $status, $oneTime, $recurring, $validDays, $items]) {
                $c = $cust($ci);
                $qid = (string) Str::uuid();
                $tax = (int) round(($oneTime + $recurring) * 0.18);
                $sentAt = in_array($status, ['sent', 'accepted', 'rejected', 'expired'], true) ? $today->copy()->subDays(abs($validDays) + 5) : null;
                DB::table('quotes')->insert([
                    'id' => $qid, 'organization_id' => $org, 'number' => $nextCode('quote', 'COT'),
                    'brand_id' => $brand, 'customer_id' => $c->id, 'owner_id' => $staffId(0),
                    'status' => $status, 'current_version' => 1, 'currency' => 'PEN',
                    'valid_until' => $today->copy()->addDays($validDays)->toDateString(),
                    'sent_at' => $sentAt,
                    'accepted_at' => $status === 'accepted' ? $today->copy()->subDays(3) : null,
                    'rejected_at' => $status === 'rejected' ? $today->copy()->subDays(2) : null,
                    'rejection_reason' => $status === 'rejected' ? 'El cliente pospuso el proyecto.' : null,
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $vid = (string) Str::uuid();
                DB::table('quote_versions')->insert([
                    'id' => $vid, 'organization_id' => $org, 'quote_id' => $qid, 'version_number' => 1,
                    'locale' => 'es', 'currency' => 'PEN', 'valid_until' => $today->copy()->addDays($validDays)->toDateString(),
                    'one_time_total_minor' => $oneTime, 'recurring_total_minor' => $recurring, 'tax_minor' => $tax,
                    'terms' => 'Precios en soles, no incluyen IGV salvo indicación. Validez según fecha indicada.',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $sort = 0;
                foreach ($items as [$desc, $charge, $cycle, $qty, $unit]) {
                    DB::table('quote_items')->insert([
                        'id' => (string) Str::uuid(), 'organization_id' => $org, 'quote_version_id' => $vid,
                        'description' => $desc, 'charge_type' => $charge, 'cycle' => $cycle,
                        'quantity' => $qty, 'unit_price_minor' => $unit, 'discount_minor' => 0,
                        'total_minor' => $qty * $unit, 'currency' => 'PEN', 'sort_order' => $sort++,
                        'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
            }

            // ---------------- CONTRATOS ----------------
            // [customerIdx, status, startOffsetDays, termMonths]
            $contracts = [
                [0, 'signed_active', -120, 12],
                [1, 'sent', -5, 12],
                [2, 'approved', -2, 24],
                [3, 'in_review', -1, 12],
                [4, 'draft', 0, 12],
            ];
            foreach ($contracts as [$ci, $status, $startOff, $term]) {
                $c = $cust($ci);
                $cid = (string) Str::uuid();
                $starts = $today->copy()->addDays($startOff);
                $approvedAt = in_array($status, ['approved', 'sent', 'signed_active'], true) ? $today->copy()->subDays(3) : null;
                $signedAt = $status === 'signed_active' ? $today->copy()->addDays($startOff) : null;
                DB::table('contracts')->insert([
                    'id' => $cid, 'organization_id' => $org, 'number' => $nextCode('contract', 'CTR'),
                    'customer_id' => $c->id, 'brand_id' => $brand, 'status' => $status, 'current_version' => 1,
                    'starts_on' => $starts->toDateString(), 'ends_on' => $starts->copy()->addMonths($term)->toDateString(),
                    'currency' => 'PEN', 'management_fee_percent' => 10.000, 'included_hours' => 4.00,
                    'approved_by' => $approvedAt !== null ? $staffId(0) : null, 'approved_at' => $approvedAt,
                    'sent_at' => in_array($status, ['sent', 'signed_active'], true) ? $today->copy()->subDays(2) : null,
                    'signed_at' => $signedAt,
                    'custom' => json_encode(['demo' => true]), 'kind' => 'contract',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                DB::table('contract_versions')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'contract_id' => $cid, 'version_number' => 1,
                    'kind' => 'original',
                    'body' => "CONTRATO DE PRESTACIÓN DE SERVICIOS\n\nEntre NubeConecta y {$c->code}, por los servicios de hosting, correo e infraestructura administrada descritos en la propuesta aceptada. Vigencia de {$term} meses renovable. Comisión de gestión 10% sobre consumo de proveedores.",
                    'variables_snapshot' => json_encode(['cliente' => $c->code, 'meses' => $term]),
                    'clause_ids' => '{}', 'locked_at' => $signedAt,
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            // ---------------- TAREAS ----------------
            // [title, description, status, priority, assigneeIdx, dueOffsetDays, customerIdx|null, checklist[]]
            $tasks = [
                ['Migrar correo de cliente a Google Workspace', 'Exportar buzones y configurar MX.', 'in_progress', 'high', 0, 2, 0, ['Respaldo de buzones', 'Alta de cuentas', 'Cambio de registros MX']],
                ['Renovar certificado SSL por vencer', 'Certificado manual próximo a expirar.', 'todo', 'critical', 1, 1, 1, []],
                ['Configurar respaldo automático diario', 'Programar snapshots en el VPS.', 'todo', 'medium', 0, 5, 2, ['Definir ventana', 'Probar restauración']],
                ['Revisión de seguridad trimestral', 'Checklist de hardening y parches.', 'in_review', 'high', 1, 3, null, []],
                ['Provisionar VPS nuevo', 'Entregar accesos al cliente.', 'done', 'medium', 0, -2, 3, ['Crear instancia', 'Instalar panel', 'Enviar credenciales']],
                ['Atender solicitud de cambio de DNS', 'Apuntar dominio a nuevo servidor.', 'blocked', 'low', 1, 4, 4, []],
                ['Onboarding de cliente nuevo', 'Reunión de bienvenida y accesos.', 'todo', 'medium', 0, 7, 0, []],
                ['Actualizar panel de administración', 'Desplegar nueva versión en producción.', 'in_progress', 'high', 1, 1, null, ['Correr pruebas', 'Respaldo', 'Despliegue']],
            ];
            foreach ($tasks as [$title, $desc, $status, $priority, $ai, $dueOff, $ci, $checklist]) {
                $tid = (string) Str::uuid();
                $completedAt = $status === 'done' ? $today->copy()->addDays($dueOff) : null;
                DB::table('tasks')->insert([
                    'id' => $tid, 'organization_id' => $org, 'number' => $nextCode('task', 'TAR'),
                    'title' => $title, 'description' => $desc, 'status' => $status, 'priority' => $priority,
                    'assignee_id' => $staffId($ai), 'due_at' => $today->copy()->addDays($dueOff)->setTime(17, 0),
                    'source_type' => 'manual', 'customer_id' => $ci === null ? null : $cust($ci)->id,
                    'is_billable' => false, 'completed_at' => $completedAt,
                    'custom' => json_encode(['demo' => true]), 'requires_approval' => false, 'is_sensitive' => false,
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $ord = 0;
                foreach ($checklist as $label) {
                    DB::table('task_checklist_items')->insert([
                        'id' => (string) Str::uuid(), 'organization_id' => $org, 'task_id' => $tid,
                        'label' => $label, 'is_done' => $status === 'done',
                        'done_at' => $status === 'done' ? $completedAt : null,
                        'created_at' => $now, 'updated_at' => $now,
                    ] + (DB::getSchemaBuilder()->hasColumn('task_checklist_items', 'sort_order') ? ['sort_order' => $ord++] : []));
                }
            }
        });

        $this->command?->info('DemoSalesOpsSeeder: cotizaciones, contratos y tareas demo creados.');
    }
}
