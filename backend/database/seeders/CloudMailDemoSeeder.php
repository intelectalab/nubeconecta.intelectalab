<?php

declare(strict_types=1);

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Datos de ejemplo para los módulos Cloud y Correo/SSL (demo de presentación).
 *
 * - Idempotente: si ya existen cuentas cloud marcadas 'DEMO-', no hace nada.
 * - Autocontenido: crea su propio proveedor, cuentas de proveedor y dominios
 *   demo (holder 'company'); enlaza proyectos a clientes reales si existen.
 * - Transaccional: todo o nada.
 *
 * Ejecutar explícitamente: php artisan db:seed --class=CloudMailDemoSeeder
 * NO se incluye en DatabaseSeeder para no sembrarlo en cada deploy/test.
 */
final class CloudMailDemoSeeder extends Seeder
{
    public function run(): void
    {
        $org = (string) DB::table('organizations')->value('id');
        if ($org === '') {
            $this->command?->warn('No hay organización; se omite CloudMailDemoSeeder.');

            return;
        }

        if (DB::table('cloud_accounts')->where('external_account_id', 'like', 'DEMO-%')->exists()) {
            $this->command?->info('CloudMailDemoSeeder: los datos demo ya existen, no se hace nada.');

            return;
        }

        $now = now();
        $month = Carbon::now()->startOfMonth()->toDateString(); // día 1 (requisito del CHECK)
        $today = Carbon::now();

        // Clientes reales para dar nombre a los proyectos (si existen); si no, null.
        $customers = DB::table('customers')->whereNull('deleted_at')->orderBy('created_at')->limit(4)->pluck('id')->all();
        $cust = static fn (int $i): ?string => $customers[$i] ?? null;

        DB::transaction(function () use ($org, $now, $month, $today, $cust): void {
            // --- Proveedores + cuentas de proveedor (una por cuenta cloud: provider_account_id es UNIQUE) ---
            $platforms = [
                ['aws', 'Amazon Web Services', 'cloud'],
                ['azure', 'Microsoft Azure', 'cloud'],
                ['gcp', 'Google Cloud', 'cloud'],
            ];
            $accIds = [];
            foreach ($platforms as $i => [$plat, $pname]) {
                $providerId = (string) Str::uuid();
                $paId = (string) Str::uuid();
                DB::table('providers')->insert([
                    'id' => $providerId, 'organization_id' => $org,
                    'code' => 'demo-'.$plat, 'name' => $pname.' (demo)', 'type' => 'cloud',
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                DB::table('provider_accounts')->insert([
                    'id' => $paId, 'organization_id' => $org, 'provider_id' => $providerId,
                    'label' => 'Cuenta '.$pname.' (demo)', 'owner' => 'company',
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                $cloudAccId = (string) Str::uuid();
                DB::table('cloud_accounts')->insert([
                    'id' => $cloudAccId, 'organization_id' => $org, 'provider_account_id' => $paId,
                    'platform' => $plat, 'external_account_id' => 'DEMO-'.strtoupper($plat).'-'.(1000 + $i),
                    'owner' => 'company', 'modality' => 'dedicated_company_account',
                    'tagging_status' => 'done', 'status' => 'active', 'version' => 1,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
                $accIds[$plat] = $cloudAccId;
            }

            // --- Proyectos (algunos enlazados a clientes reales) + presupuesto del mes ---
            // [nombre, cuenta, ambiente, región, visible, customerIdx, budgetMinor|null, actualMinor]
            $projects = [
                ['Plataforma web', 'aws', 'production', 'us-east-1', true, 0, 500000, 540000],   // sobre presupuesto
                ['Data lake', 'aws', 'production', 'us-east-1', true, 1, 800000, 620000],
                ['Respaldos', 'azure', 'staging', 'eastus', false, 0, 200000, 150000],
                ['Correo corporativo', 'gcp', 'production', 'southamerica-east1', true, 2, 300000, 330000], // sobre presupuesto
                ['Laboratorio', 'azure', 'development', 'eastus', false, null, null, 0],
            ];
            $projIds = [];
            foreach ($projects as [$name, $plat, $env, $region, $visible, $ci, $budget, $actual]) {
                $pid = (string) Str::uuid();
                DB::table('cloud_projects')->insert([
                    'id' => $pid, 'organization_id' => $org, 'cloud_account_id' => $accIds[$plat],
                    'customer_id' => $ci === null ? null : $cust($ci),
                    'name' => $name, 'environment' => $env, 'region' => $region,
                    'visible_to_customer' => $visible, 'is_shared' => false, 'tags' => '{}',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $projIds[] = $pid;
                if ($budget !== null) {
                    DB::table('cloud_budgets')->insert([
                        'id' => (string) Str::uuid(), 'organization_id' => $org, 'cloud_project_id' => $pid,
                        'period_month' => $month, 'amount_minor' => $budget, 'cost_currency' => 'USD',
                        'actual_minor' => $actual, 'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                    ]);
                }
            }

            // --- Recursos (realismo para resources_total / sin asignar) ---
            $resources = [
                [0, 'ec2', 'server', 'web-prod-1', 'active', 'assigned', 180000],
                [0, 'rds', 'database', 'db-prod-1', 'active', 'assigned', 260000],
                [0, 's3', 'storage', 'assets-prod', 'active', 'unassigned', 40000],
                [1, 'ec2', 'server', 'etl-1', 'active', 'assigned', 150000],
                [1, 's3', 'storage', 'lake-raw', 'active', 'unassigned', 90000],
                [2, 'vm', 'server', 'backup-vm', 'stopped', 'assigned', 30000],
            ];
            foreach ($resources as [$pi, $type, $kind, $ext, $status, $assign, $cost]) {
                DB::table('cloud_resources')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'cloud_project_id' => $projIds[$pi],
                    'resource_type' => $type, 'kind' => $kind, 'external_id' => 'DEMO-'.$ext, 'tags' => '{}',
                    'status' => $status, 'is_shared' => false, 'assignment_status' => $assign,
                    'monthly_cost_minor' => $cost, 'cost_currency' => 'USD',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            // --- Dominios demo (holder company) para correo y SSL ---
            $domNames = ['cloudnube-demo1.pe', 'cloudnube-demo2.pe', 'cloudnube-demo3.pe', 'cloudnube-demo4.pe'];
            $domIds = [];
            foreach ($domNames as $dn) {
                $did = (string) Str::uuid();
                DB::table('domains')->insert([
                    'id' => $did, 'organization_id' => $org, 'name' => $dn, 'tld' => 'pe',
                    'holder' => 'company', 'status' => 'active', 'sync_mode' => 'manual',
                    'auto_renew' => true, 'lock' => true, 'nameservers' => '[]',
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
                $domIds[] = $did;
            }

            // --- Servicios de correo (licencias asignadas vs facturadas) ---
            // [domIdx, provider_kind, purchased, used, billed, renewalOffsetDays, owner, plan]
            $mail = [
                [0, 'google_workspace', 20, 18, 18, 45, 'company', 'Business Standard'],
                [1, 'microsoft_365', 15, 12, 10, 20, 'company', 'Business Basic'],       // +2 sin facturar + renueva 30d
                [2, 'cpanel', 10, 5, 8, 60, 'customer', 'Correo cPanel'],                 // 3 facturadas de más
                [3, 'other', 4, 3, 3, 10, 'company', 'Zimbra'],                           // renueva 30d
            ];
            foreach ($mail as [$di, $kind, $purch, $used, $billed, $off, $owner, $plan]) {
                DB::table('mail_services')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'domain_id' => $domIds[$di],
                    'provider_kind' => $kind, 'account_owner' => $owner, 'status' => 'active', 'sync_mode' => 'manual',
                    'plan' => $plan, 'seats_purchased' => $purch, 'seats_used' => $used, 'seats_billed' => $billed,
                    'mailboxes_count' => $used, 'renewal_date' => $today->copy()->addDays($off)->toDateString(),
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }

            // --- Certificados SSL ---
            // [domIdx, common_name, kind, renewal_mode, expiresOffsetDays, status, wildcard, coveredPgArray]
            $ssl = [
                [0, 'cloudnube-demo1.pe', 'paid', 'manual', 15, 'valid', false, '{}'],            // por vencer + manual
                [1, 'cloudnube-demo2.pe', 'free_auto', 'automatic', 80, 'valid', false, '{}'],
                [2, '*.cloudnube-demo3.pe', 'paid', 'manual', 200, 'valid', true, '{"*.cloudnube-demo3.pe","cloudnube-demo3.pe"}'],
                [3, 'cloudnube-demo4.pe', 'free_auto', 'automatic', 25, 'valid', false, '{}'],      // por vencer (auto)
                [0, 'mail.cloudnube-demo1.pe', 'paid', 'manual', -5, 'expired', false, '{}'],       // vencido + manual
            ];
            foreach ($ssl as [$di, $cn, $kind, $mode, $off, $status, $wild, $covered]) {
                $issued = $today->copy()->addDays($off)->subYear()->toDateString();
                DB::table('ssl_certificates')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $org, 'domain_id' => $domIds[$di],
                    'common_name' => $cn, 'covered_names' => $covered, 'is_wildcard' => $wild,
                    'kind' => $kind, 'renewal_mode' => $mode, 'is_published' => true, 'status' => $status,
                    'issuer' => $kind === 'paid' ? 'Sectigo' : "Let's Encrypt",
                    'issued_at' => $issued, 'expires_at' => $today->copy()->addDays($off)->toDateString(),
                    'version' => 1, 'created_at' => $now, 'updated_at' => $now,
                ]);
            }
        });

        $this->command?->info('CloudMailDemoSeeder: datos demo de Cloud y Correo/SSL creados.');

        $this->seedPortalUser($org, $now);
    }

    /**
     * Crea un acceso de portal de cliente para la demo: usuario type=customer con
     * rol customer_admin, enlazado como contacto de un cliente existente. SIN
     * contraseña (se fija aparte con el comando seguro; no se envía invitación).
     */
    private function seedPortalUser(string $org, \Illuminate\Support\Carbon $now): void
    {
        $email = 'cliente.demo@nubeconecta.pe';
        if (DB::table('users')->whereRaw('lower(email) = ?', [$email])->exists()) {
            $this->command?->info('Portal demo: el usuario cliente.demo ya existe, no se toca.');

            return;
        }
        $customerId = DB::table('customers')->whereNull('deleted_at')->orderBy('created_at')->value('id');
        if ($customerId === null) {
            $this->command?->warn('Portal demo: no hay clientes para enlazar; se omite (créalo donde sí existan, p. ej. prod).');

            return;
        }
        $roleId = DB::table('roles')->where('code', 'customer_admin')->where('audience', 'customer')->value('id');
        if ($roleId === null) {
            $this->command?->warn('Portal demo: rol customer_admin (audience customer) no encontrado; se omite.');

            return;
        }

        DB::transaction(function () use ($org, $now, $email, $customerId, $roleId): void {
            $userId = (string) Str::uuid();
            DB::table('users')->insert([
                'id' => $userId, 'organization_id' => $org, 'type' => 'customer', 'name' => 'Cliente Demo',
                'email' => $email, 'status' => 'active', 'locale' => 'es', 'timezone' => 'America/Lima',
                'failed_login_count' => 0, 'must_change_password' => false, 'version' => 1,
                'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('contacts')->insert([
                'id' => (string) Str::uuid(), 'organization_id' => $org, 'customer_id' => $customerId,
                'name' => 'Cliente Demo', 'email' => $email, 'roles' => '{administrative}', 'is_primary' => false,
                'user_id' => $userId, 'version' => 1, 'created_at' => $now, 'updated_at' => $now,
            ]);
            DB::table('user_roles')->insert([
                'id' => (string) Str::uuid(), 'organization_id' => $org, 'user_id' => $userId, 'role_id' => $roleId,
                'created_at' => $now, 'updated_at' => $now,
            ]);
        });
        $this->command?->info('Portal demo: usuario cliente.demo@nubeconecta.pe creado (sin contraseña; fíjala con el comando seguro).');
    }
}
