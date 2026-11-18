<?php

declare(strict_types=1);

namespace Database\Seeders;

use Carbon\CarbonImmutable;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Datos demo del core (clientes, servicios, suscripciones, facturas, pagos,
 * leads y tickets) para que tableros y KPIs se vean poblados en una demostracion.
 *
 * NO esta en DatabaseSeeder. Ejecutar:
 *   php artisan db:seed --class=CoreDemoSeeder --force
 *
 * Idempotente: si ya existe el cliente DEMO-CLI-001 no hace nada. Transaccional.
 * Reutiliza prerrequisitos existentes (entidad legal, marca, categorias, SLA) y
 * crea solo los que falten. Todas las suscripciones demo son en PEN (si hubiera
 * una activa en otra moneda, el KPI de MRR y su serie se omiten).
 */
final class CoreDemoSeeder extends Seeder
{
    private string $org;

    public function run(): void
    {
        $this->org = (string) DB::table('organizations')->value('id');
        if ($this->org === '') {
            $this->command?->warn('Sin organizacion: nada que hacer.');

            return;
        }
        if (DB::table('customers')->where('organization_id', $this->org)->where('code', 'DEMO-CLI-001')->exists()) {
            $this->command?->info('CoreDemoSeeder: datos demo ya existentes, se omite.');

            return;
        }

        DB::transaction(function (): void {
            $now = CarbonImmutable::now('UTC');
            $staff = DB::table('users')->orderBy('created_at')->limit(2)->pluck('id')->all();
            $admin = $staff[0] ?? null;

            // ---------- Prerrequisitos (reutiliza o crea) ----------
            $legal = $this->legalEntity();
            $brand = $this->brand($legal);
            $cats = [
                'shared_hosting' => $this->category('shared_hosting', 'hosting', 'Hosting'),
                'domain' => $this->category('domain', 'dominios', 'Dominios'),
                'email' => $this->category('email', 'correo', 'Correo corporativo'),
            ];
            $products = [];
            foreach ([
                ['DEMO-HOST-START', 'shared_hosting', 'Hosting Start'],
                ['DEMO-HOST-PRO', 'shared_hosting', 'Hosting Pro'],
                ['DEMO-HOST-BIZ', 'shared_hosting', 'Hosting Business'],
                ['DEMO-DOM-PE', 'domain', 'Dominio .pe'],
                ['DEMO-DOM-COM', 'domain', 'Dominio .com'],
                ['DEMO-MAIL-5', 'email', 'Correo corporativo 5 buzones'],
            ] as [$code, $cat, $name]) {
                $products[$code] = $this->product($code, $cats[$cat], $brand, $name);
            }
            $slaPolicy = $this->slaPolicy();
            $pm = DB::table('payment_methods')->where('organization_id', $this->org)->pluck('id', 'kind')->all();
            $pmBank = $pm['bank_transfer'] ?? array_values($pm)[0] ?? null;
            $pmCard = $pm['card_gateway'] ?? $pmBank;
            if ($pmBank === null) {
                throw new \RuntimeException('No hay payment_methods: sembrar los medios de pago antes.');
            }

            // ---------- Clientes + contactos ----------
            $clientes = [
                ['company', 'Andina Logistica SAC', 'Andina Logistica', 'ruc', null, 'Av. Argentina 1450, Callao'],
                ['company', 'Estudio Contable Ramos EIRL', 'Contadores Ramos', 'ruc', null, 'Jr. Union 330, Lima'],
                ['company', 'Panaderia La Esperanza SAC', 'La Esperanza', 'ruc', null, 'Av. Brasil 2100, Jesus Maria'],
                ['company', 'Constructora Pacifico SA', 'Pacifico', 'ruc', null, 'Av. Javier Prado Este 4200, Santiago de Surco'],
                ['company', 'Clinica Dental Sonrisa SAC', 'Sonrisa', 'ruc', null, 'Calle Los Pinos 215, Miraflores'],
                ['individual', 'Lucia Fernandez Quispe', null, 'dni', null, 'Av. Larco 800, Miraflores'],
                ['individual', 'Marco Villanueva Paredes', null, 'dni', null, 'Jr. Cusco 120, Arequipa'],
                ['company', 'Academia Digital Horizonte SAC', 'Horizonte', 'ruc', null, 'Av. Sucre 640, Pueblo Libre'],
            ];
            // Nombre de la persona de contacto por cliente (para empresas); un individuo es su propio contacto.
            $personas = ['Carla Rojas Mendoza', 'Jorge Salas Pinto', 'Ana Torres Vega', 'Diego Ramos Flores', 'Sofia Mendez Cruz', 'Luis Paredes Soto', 'Rocio Campos Diaz', 'Victor Nunez Rios'];
            $customers = [];
            foreach ($clientes as $i => [$type, $name, $trade, $idType, , $addr]) {
                $n = $i + 1;
                $taxId = $idType === 'ruc' ? $this->ruc(10000000 + $n * 137211) : sprintf('4%07d', 1200000 + $n * 7331);
                $id = (string) Str::uuid();
                $email = 'cliente'.$n.'@demo.nubeconecta.test';
                DB::table('customers')->insert([
                    'id' => $id, 'organization_id' => $this->org,
                    'code' => sprintf('DEMO-CLI-%03d', $n), 'type' => $type,
                    'legal_name' => $name, 'trade_name' => $trade, 'normalized_name' => Str::lower(Str::ascii($name)),
                    'tax_id_type' => $idType, 'tax_id' => $taxId, 'country' => 'PE', 'currency' => 'PEN',
                    'email' => $email, 'phone' => '+5198'.sprintf('%07d', 1000000 + $n * 4321), 'address' => $addr,
                    'origin_brand_id' => $brand, 'account_manager_id' => $admin,
                    'created_at' => $now->subMonths(12 - $n)->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
                DB::table('contacts')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'customer_id' => $id,
                    'name' => $type === 'company' ? ($personas[$i] ?? 'Contacto '.($trade ?? $name)) : $name,
                    'email' => $email, 'phone' => '+5198'.sprintf('%07d', 1000000 + $n * 4321),
                    'roles' => '{billing,administrative}', 'is_primary' => true,
                ]);
                $customers[$n] = $id;
            }

            // ---------- Servicios + suscripciones (todas activas en PEN) ----------
            // [cliente, producto, etiqueta, ciclo, precio (centimos), cantidad, meses atras de inicio]
            $subs = [
                [1, 'DEMO-HOST-BIZ', 'andinalogistica.pe', 'annual', 89900, 1, 11],
                [1, 'DEMO-MAIL-5', 'Correo andinalogistica.pe', 'monthly', 4500, 2, 10],
                [2, 'DEMO-HOST-PRO', 'ramoscontadores.com', 'annual', 59900, 1, 9],
                [2, 'DEMO-DOM-COM', 'ramoscontadores.com (dominio)', 'annual', 6500, 1, 9],
                [3, 'DEMO-HOST-START', 'laesperanza.pe', 'quarterly', 9900, 1, 8],
                [4, 'DEMO-HOST-BIZ', 'constructorapacifico.com', 'monthly', 12900, 1, 7],
                [4, 'DEMO-MAIL-5', 'Correo constructorapacifico.com', 'monthly', 4500, 3, 6],
                [5, 'DEMO-HOST-PRO', 'sonrisadental.pe', 'quarterly', 17900, 1, 5],
                [6, 'DEMO-DOM-PE', 'luciafernandez.pe', 'annual', 12000, 1, 4],
                [7, 'DEMO-HOST-START', 'marcovillanueva.com', 'monthly', 3500, 1, 3],
                [8, 'DEMO-HOST-BIZ', 'horizonte.edu.pe', 'annual', 119900, 1, 2],
                [8, 'DEMO-MAIL-5', 'Correo horizonte.edu.pe', 'monthly', 4500, 4, 1],
            ];
            $subByCustomer = [];
            foreach ($subs as $k => [$cn, $pcode, $label, $cycle, $price, $qty, $monthsAgo]) {
                $start = $now->startOfMonth()->subMonths($monthsAgo)->addDays(3);
                $svc = (string) Str::uuid();
                $months = ['monthly' => 1, 'quarterly' => 3, 'annual' => 12][$cycle];
                $next = $start;
                while ($next->lte($now)) {
                    $next = $next->addMonthsNoOverflow($months);
                }
                DB::table('services')->insert([
                    'id' => $svc, 'organization_id' => $this->org, 'code' => sprintf('DEMO-SRV-%03d', $k + 1),
                    'customer_id' => $customers[$cn], 'brand_id' => $brand, 'product_id' => $products[$pcode],
                    'label' => $label, 'status' => 'active', 'activated_at' => $start->toDateTimeString(),
                    'commercial_due_date' => $next->toDateString(), 'auto_renew' => true,
                    'created_at' => $start->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
                $subId = (string) Str::uuid();
                DB::table('subscriptions')->insert([
                    'id' => $subId, 'organization_id' => $this->org, 'service_id' => $svc, 'cycle' => $cycle,
                    'quantity' => $qty, 'price_minor' => $price, 'currency' => 'PEN',
                    'next_invoice_date' => $next->toDateString(), 'starts_on' => $start->toDateString(), 'ends_on' => null,
                    'status' => 'active',
                    'created_at' => $start->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
                $subByCustomer[$cn][] = ['sub' => $subId, 'svc' => $svc, 'product' => $products[$pcode], 'label' => $label,
                    'amount' => (int) round($price * $qty), 'start' => $start];
            }

            // ---------- Series (reutiliza o crea series demo dedicadas) ----------
            $seriesId = [];
            foreach (['invoice' => 'FD01', 'receipt' => 'BD01'] as $type => $serie) {
                $row = DB::table('document_series')->where('organization_id', $this->org)
                    ->where('legal_entity_id', $legal)->where('series', $serie)->first();
                $seriesId[$type] = $row->id ?? (string) Str::uuid();
                if ($row === null) {
                    DB::table('document_series')->insert([
                        'id' => $seriesId[$type], 'organization_id' => $this->org, 'legal_entity_id' => $legal,
                        'document_type' => $type, 'series' => $serie, 'next_number' => 1,
                    ]);
                }
            }
            $numbers = ['invoice' => (int) (DB::table('invoices')->where('organization_id', $this->org)->where('legal_entity_id', $legal)->where('series', 'FD01')->max('number') ?? 0),
                'receipt' => (int) (DB::table('invoices')->where('organization_id', $this->org)->where('legal_entity_id', $legal)->where('series', 'BD01')->max('number') ?? 0)];

            // ---------- Facturas + pagos (curva de 12 meses) ----------
            $perMonth = [2, 2, 2, 2, 2, 3, 2, 3, 3, 3, 3, 4]; // de hace 11 meses a este mes
            $invoiceCount = $paymentCount = 0;
            $seq = 0;
            $currentMonthIssued = [];
            foreach ($perMonth as $idx => $count) {
                $age = 11 - $idx;
                for ($j = 0; $j < $count; $j++) {
                    $seq++;
                    $cn = ($seq - 1) % 8 + 1;
                    // Solo clientes con suscripcion iniciada antes del mes de emision.
                    $monthStart = $now->startOfMonth()->subMonths($age);
                    $cands = array_values(array_filter($subByCustomer[$cn] ?? [], fn ($s) => $s['start']->lte($monthStart->endOfMonth())));
                    if ($cands === []) {
                        $cn = 1;
                        $cands = $subByCustomer[1];
                    }
                    $s = $cands[$j % count($cands)];
                    $issue = $monthStart->addDays(2 + $j * 4);
                    if ($issue->gt($now)) {
                        $issue = $now->startOfDay();
                    }
                    $type = $cn === 6 || $cn === 7 ? 'receipt' : 'invoice';
                    $numbers[$type]++;
                    $serie = $type === 'invoice' ? 'FD01' : 'BD01';

                    $sub = intdiv($s['amount'] * 100, 118);
                    $tax = $s['amount'] - $sub;
                    $total = $sub + $tax;

                    // Estado segun antiguedad.
                    $status = 'paid';
                    $due = $issue->addDays(15);
                    if ($age === 0) {
                        // Mes en curso: 2 pagadas, 1 parcial y el resto emitidas (con actividad real de cobro).
                        $status = $j < 2 ? 'paid' : ($j === 2 ? 'partially_paid' : 'issued');
                        $due = $issue->addDays(30);
                    } elseif ($age <= 2) {
                        $status = $j === 0 && $age === 1 ? 'partially_paid' : ($j % 2 === 0 ? 'overdue' : 'paid');
                    }
                    $paidAmount = match ($status) {
                        'paid' => $total, 'partially_paid' => intdiv($total, 2), default => 0,
                    };
                    $invId = (string) Str::uuid();
                    $issuedAt = $issue->setTime(10, 0);
                    DB::table('invoices')->insert([
                        'id' => $invId, 'organization_id' => $this->org, 'legal_entity_id' => $legal, 'brand_id' => $brand,
                        'customer_id' => $customers[$cn], 'type' => $type, 'status' => $status, 'fiscal_status' => 'accepted',
                        'document_series_id' => $seriesId[$type], 'series' => $serie, 'number' => $numbers[$type],
                        'currency' => 'PEN', 'issue_date' => $issue->toDateString(), 'due_date' => $due->toDateString(),
                        'subtotal_minor' => $sub, 'tax_minor' => $tax, 'total_minor' => $total,
                        'balance_minor' => $total - $paidAmount,
                        'issued_at' => $issuedAt->toDateTimeString(), 'issued_by' => $admin,
                        'paid_at' => $status === 'paid' ? $issue->addDays(4)->setTime(15, 0)->min($now)->toDateTimeString() : null,
                        'created_at' => $issuedAt->toDateTimeString(), 'updated_at' => $issuedAt->toDateTimeString(),
                    ]);
                    DB::table('invoice_items')->insert([
                        'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'invoice_id' => $invId,
                        'kind' => 'service', 'service_id' => $s['svc'], 'subscription_id' => $s['sub'], 'product_id' => $s['product'],
                        'description' => $s['label'], 'period_start' => $issue->toDateString(), 'period_end' => $issue->addMonthNoOverflow()->toDateString(),
                        'quantity' => 1, 'unit_price_minor' => $sub, 'subtotal_minor' => $sub, 'tax_minor' => $tax,
                        'total_minor' => $total, 'currency' => 'PEN',
                    ]);
                    $invoiceCount++;

                    if ($paidAmount > 0) {
                        $paidOn = $issue->addDays(3 + $j)->setTime(14, 30);
                        if ($paidOn->gt($now)) {
                            $paidOn = $now->subHour();
                        }
                        $card = $seq % 5 === 0;
                        $payId = (string) Str::uuid();
                        DB::table('payments')->insert([
                            'id' => $payId, 'organization_id' => $this->org, 'customer_id' => $customers[$cn],
                            'payment_method_id' => $card ? $pmCard : $pmBank, 'kind' => 'payment', 'status' => 'validated',
                            'amount_minor' => $paidAmount, 'currency' => 'PEN', 'fee_minor' => $card ? (int) round($paidAmount * 0.035) : 0,
                            'external_id' => $card ? 'DEMO-PAY-'.str_pad((string) $seq, 4, '0', STR_PAD_LEFT) : null,
                            'reported_via' => $card ? 'webhook' : 'portal', 'received_at' => $paidOn->toDateTimeString(),
                            'validated_by' => $card ? null : $admin, 'validated_at' => $paidOn->toDateTimeString(),
                            'created_at' => $paidOn->toDateTimeString(), 'updated_at' => $paidOn->toDateTimeString(),
                        ]);
                        DB::table('payment_allocations')->insert([
                            'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'payment_id' => $payId,
                            'invoice_id' => $invId, 'amount_minor' => $paidAmount, 'currency' => 'PEN',
                        ]);
                        $paymentCount++;
                    }
                    if ($age === 0) {
                        $currentMonthIssued[] = ['cn' => $cn, 'total' => $total];
                    }
                }
            }
            // Pagos reportados (pendientes de validar): sobre facturas del mes actual.
            $pending = 0;
            foreach (array_slice($currentMonthIssued, 0, 3) as $k => $p) {
                DB::table('payments')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'customer_id' => $customers[$p['cn']],
                    'payment_method_id' => $pmBank, 'kind' => 'payment', 'status' => 'reported',
                    'amount_minor' => $p['total'], 'currency' => 'PEN', 'reported_via' => 'portal',
                    'received_at' => $now->subDays($k)->toDateTimeString(), 'notes' => 'Voucher cargado desde el portal (demo)',
                    'created_at' => $now->subDays($k)->toDateTimeString(), 'updated_at' => $now->subDays($k)->toDateTimeString(),
                ]);
                $pending++;
            }
            foreach (['invoice' => 'FD01', 'receipt' => 'BD01'] as $type => $serie) {
                DB::table('document_series')->where('id', $seriesId[$type])->update(['next_number' => $numbers[$type] + 1]);
            }

            // ---------- Leads ----------
            $stage = DB::table('pipeline_stages')->where('organization_id', $this->org)->pluck('id', 'code')->all();
            $channel = DB::table('lead_channels')->where('organization_id', $this->org)->pluck('id', 'code')->all();
            $chDefault = $channel['web'] ?? array_values($channel)[0] ?? null;
            if ($chDefault === null || ! isset($stage['new'], $stage['won'])) {
                throw new \RuntimeException('Faltan pipeline_stages / lead_channels: sembrar el modulo Sales antes.');
            }
            // [nombre, empresa, etapa, monto, canal, dias desde creacion]
            $leads = [
                ['Rosa Medina', 'Bodega Medina', 'new', 45000, 'web', 3],
                ['Jorge Salazar', 'Salazar Ingenieros', 'contacted', 120000, 'whatsapp', 8],
                ['Patricia Campos', 'Boutique Campos', 'proposal_sent', 89000, 'referral', 14],
                ['Daniel Rojas', 'Rojas Transportes', 'negotiation', 260000, 'call', 20],
                ['Carla Mendoza', 'Colegio Mendoza', 'proposal_sent', 180000, 'web', 11],
                ['Hugo Paredes', 'Paredes Importaciones', 'new', 75000, 'web', 1],
                ['Silvia Torres', 'Torres & Asociados', 'negotiation', 310000, 'referral', 25],
                ['Nelson Aguilar', 'Aguilar Tech', 'won', 150000, 'web', 18],
                ['Mariela Ponce', 'Ponce Eventos', 'won', 98000, 'whatsapp', 12],
                ['Raul Cardenas', 'Cardenas Farma', 'won', 220000, 'call', 9],
            ];
            $wonIdx = 0;
            foreach ($leads as $k => [$name, $company, $st, $amt, $ch, $daysAgo]) {
                $won = $st === 'won';
                $created = $now->subDays($daysAgo);
                DB::table('leads')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'code' => sprintf('DEMO-L-%03d', $k + 1),
                    'name' => $name, 'company_name' => $company, 'email' => Str::slug($name, '.').'@demo.test',
                    'brand_id' => $brand, 'lead_channel_id' => $channel[$ch] ?? $chDefault, 'pipeline_stage_id' => $stage[$st] ?? $stage['new'],
                    'status' => $won ? 'won' : 'open', 'estimated_amount_minor' => $amt, 'currency' => 'PEN',
                    'owner_id' => $staff[$k % max(1, count($staff))] ?? null,
                    'customer_id' => $won ? $customers[1 + ($wonIdx++ % 8)] : null,
                    'converted_at' => $won ? $now->subDays(1 + $wonIdx)->toDateTimeString() : null,
                    'last_activity_at' => $now->subDays(max(0, $daysAgo - 2))->toDateTimeString(),
                    'next_follow_up_at' => $won ? null : $now->addDays(1 + $k % 4)->toDateTimeString(),
                    'created_at' => $created->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
            }

            // ---------- Tickets ----------
            // [n, cliente, tipo, estado, prioridad, asunto, asignado, horas hasta vencer resolucion (neg = vencido)]
            $tickets = [
                [1, 1, 'incident', 'open', 'high', 'Sitio web lento desde ayer', true, -20],
                [2, 2, 'request', 'in_progress', 'medium', 'Crear 3 buzones nuevos de correo', true, 30],
                [3, 4, 'billing', 'new', 'low', 'Consulta sobre factura de octubre', false, 60],
                [4, 5, 'incident', 'waiting_customer', 'critical', 'Error 500 en formulario de citas', true, -5],
                [5, 8, 'question', 'open', 'low', 'Como configurar el correo en el celular', false, 48],
                [6, 3, 'request', 'resolved', 'medium', 'Renovacion de certificado SSL', true, 10],
            ];
            foreach ($tickets as [$n, $cn, $type, $status, $prio, $subject, $assigned, $dueH]) {
                $resolved = $status === 'resolved';
                $created = $now->subDays(2 + $n);
                DB::table('tickets')->insert([
                    'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'number' => sprintf('DEMO-T-%04d', $n),
                    'customer_id' => $customers[$cn], 'brand_id' => $brand, 'type' => $type, 'status' => $status, 'priority' => $prio,
                    'channel' => ['portal', 'email', 'whatsapp', 'portal', 'email', 'phone'][$n - 1], 'subject' => $subject,
                    'assignee_id' => $assigned ? ($staff[$n % max(1, count($staff))] ?? null) : null,
                    'sla_policy_id' => $slaPolicy,
                    'first_response_due_at' => $created->addHours(4)->toDateTimeString(),
                    'first_responded_at' => $status === 'new' ? null : $created->addHours(2)->toDateTimeString(),
                    'resolution_due_at' => $now->addHours($dueH)->toDateTimeString(),
                    'sla_breached' => $dueH < 0 && ! $resolved,
                    'resolved_at' => $resolved ? $now->subHours(6)->toDateTimeString() : null,
                    'last_customer_activity_at' => $now->subHours($n * 3)->toDateTimeString(),
                    'created_at' => $created->toDateTimeString(), 'updated_at' => $now->toDateTimeString(),
                ]);
            }

            $this->command?->info(sprintf(
                'CoreDemoSeeder: %d clientes, %d servicios/suscripciones, %d facturas, %d pagos validados, %d pendientes, %d leads, %d tickets.',
                count($customers), count($subs), $invoiceCount, $paymentCount, $pending, count($leads), count($tickets)
            ));
        });
    }

    private function legalEntity(): string
    {
        $id = DB::table('legal_entities')->where('organization_id', $this->org)->orderBy('created_at')->value('id');
        if ($id) {
            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table('legal_entities')->insert([
            'id' => $id, 'organization_id' => $this->org, 'legal_name' => 'NubeConecta Demo SAC', 'tax_id_type' => 'ruc',
            'tax_id' => $this->ruc(60123456), 'country' => 'PE', 'currency' => 'PEN', 'fiscal_address' => 'Av. Demo 123, Lima',
        ]);

        return $id;
    }

    private function brand(string $legal): string
    {
        $id = DB::table('brands')->where('organization_id', $this->org)->whereNull('deleted_at')->orderBy('created_at')->value('id');
        if ($id) {
            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table('brands')->insert([
            'id' => $id, 'organization_id' => $this->org, 'code' => 'nubeconecta', 'name' => 'NubeConecta',
            'default_legal_entity_id' => $legal, 'status' => 'active',
        ]);

        return $id;
    }

    private function category(string $kind, string $code, string $name): string
    {
        $id = DB::table('product_categories')->where('organization_id', $this->org)->where('kind', $kind)->whereNull('parent_id')->value('id');
        if ($id) {
            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table('product_categories')->insert([
            'id' => $id, 'organization_id' => $this->org, 'code' => $code, 'name' => $name, 'kind' => $kind, 'is_system' => true,
        ]);

        return $id;
    }

    private function product(string $code, string $category, string $brand, string $name): string
    {
        $id = DB::table('products')->where('organization_id', $this->org)->where('code', $code)->value('id');
        if ($id) {
            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table('products')->insert([
            'id' => $id, 'organization_id' => $this->org, 'code' => $code, 'category_id' => $category, 'brand_id' => $brand,
            'name' => $name, 'billing_type' => 'recurring', 'is_active' => true, 'sellable_online' => true,
        ]);

        return $id;
    }

    private function slaPolicy(): string
    {
        $id = DB::table('sla_policies')->where('organization_id', $this->org)->where('scope_type', 'global')->value('id');
        if ($id) {
            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table('sla_policies')->insert(['id' => $id, 'organization_id' => $this->org, 'name' => 'SLA general (demo)']);
        foreach (['critical' => [30, 240], 'high' => [60, 480], 'medium' => [240, 1440], 'low' => [480, 2880]] as $prio => [$fr, $res]) {
            DB::table('sla_targets')->insert([
                'id' => (string) Str::uuid(), 'organization_id' => $this->org, 'sla_policy_id' => $id,
                'priority' => $prio, 'first_response_minutes' => $fr, 'resolution_minutes' => $res,
            ]);
        }

        return $id;
    }

    /** RUC peruano de 11 digitos con digito verificador a partir de 9 digitos base (prefijo 20 + 8 digitos). */
    private function ruc(int $eightDigits): string
    {
        $base = '20'.str_pad((string) ($eightDigits % 100000000), 8, '0', STR_PAD_LEFT);
        $weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
        $sum = 0;
        foreach ($weights as $i => $w) {
            $sum += (int) $base[$i] * $w;
        }
        $check = (11 - ($sum % 11)) % 10;

        return $base.$check;
    }
}
