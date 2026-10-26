<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Modules\Billing\Connectors\FakeEInvoiceConnector;
use App\Modules\Billing\Events\EInvoiceAccepted;
use App\Modules\Billing\Events\InvoiceIssued;
use App\Modules\Billing\Support\AmountInWords;
use App\Modules\Brands\Services\DocumentNumberAllocator;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use RuntimeException;

/** Franja MVP de M-BIL: comprobante al aprobar, totales, numeración, conector simulado, impresión, renovación y portal. */
final class BillingTest extends SalesFlowTestCase
{
    /** @return array<string, mixed> comprobante del pedido */
    private function orderInvoice(array $order): array
    {
        $id = DB::table('invoices')->whereRaw("custom->>'order_id' = ?", [$order['id']])->value('id');

        return $this->getJson("/api/v1/admin/invoices/{$id}")->assertOk()->json('data');
    }

    /** @return array<string, mixed> */
    private function issue(string $id): array
    {
        return $this->postJson("/api/v1/admin/invoices/{$id}/issue", [], $this->key())->assertOk()->json('data');
    }

    public function test_order_approval_drafts_invoice_with_exact_totals(): void
    {
        $order = $this->approvedOrder();
        $invoice = $this->orderInvoice($order);

        $this->assertSame(['draft', 'not_applicable', 'invoice', 'PEN', 'taxed'], [$invoice['status'], $invoice['fiscal_status'], $invoice['type'], $invoice['currency'], $invoice['tax_treatment']]);
        $this->assertNull($invoice['number']);
        // 2 × 19,90 + instalación 10,00 + 1,5 h × 95,00 = 192,30; IGV 18 % = 34,614 → 34,61; total 226,91.
        $this->assertSame([19230, 3461, 22691, 0], [$invoice['subtotal_minor'], $invoice['tax_minor'], $invoice['total_minor'], $invoice['balance_minor']]);
        $this->assertSame($order['total_minor'], $invoice['total_minor'], 'cuadra con el pedido');
        $this->assertSame([3980, 1000, 14250], array_column($invoice['items'], 'subtotal_minor'));
        $this->assertSame([716, 180, 2565], array_column($invoice['items'], 'tax_minor'));
        $this->assertSame($invoice['tax_minor'], array_sum(array_column($invoice['items'], 'tax_minor')));
        $this->assertSame($invoice['total_minor'], array_sum(array_column($invoice['items'], 'total_minor')));
        $this->assertSame(['service', 'one_time', 'one_time'], array_column($invoice['items'], 'kind'));
        $this->assertNotNull($invoice['items'][0]['service_id']);
        $this->assertSame(now()->toDateString(), $invoice['items'][0]['period_start']);
        $this->assertSame(['order', $order['id']], [$invoice['origin']['type'], $invoice['origin']['order_id']]);
        $this->getJson("/api/v1/admin/invoices?filter[order_id]={$order['id']}")->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $invoice['id']);
        $this->getJson('/api/v1/admin/invoices?filter[order_id]='.\Illuminate\Support\Str::uuid())->assertOk()->assertJsonCount(0, 'data');

        // Reparto del redondeo: la suma de IGV por línea siempre es la del total.
        $taxes = \App\Modules\Billing\Services\InvoiceService::distributeTax([['amount_minor' => 5, 'taxed' => true], ['amount_minor' => 5, 'taxed' => true], ['amount_minor' => 5, 'taxed' => false]], '18.0000', 2);
        $this->assertSame(2, array_sum($taxes));
        $this->assertSame(1, DB::table('invoices')->count(), 'un solo comprobante por pedido');
    }

    public function test_issue_assigns_correlative_numbers_without_gaps_and_fake_connector_accepts(): void
    {
        Event::fake([InvoiceIssued::class, EInvoiceAccepted::class]);
        $a = $this->orderInvoice($this->approvedOrder());
        $headers = $this->key();
        $issued = $this->postJson("/api/v1/admin/invoices/{$a['id']}/issue", [], $headers)->assertOk()->json('data');
        $this->assertSame(['F001-00000001', 1, 'issued', 'accepted'], [$issued['number'], $issued['correlative'], $issued['status'], $issued['fiscal_status']]);
        $this->assertSame($issued['total_minor'], $issued['balance_minor'], 'saldo pendiente = total');
        $this->assertSame(now()->toDateString(), $issued['issue_date']);
        $this->assertTrue($issued['einvoice']['simulated']);
        $this->assertSame('fake', $issued['einvoice']['provider']);
        $this->assertStringContainsString('SIMULACIÓN', $issued['einvoice']['cdr']['description']);
        $this->assertSame(['issue', 'accepted', 'fake'], array_values((array) DB::table('einvoice_submissions')->where('invoice_id', $a['id'])->first(['operation', 'status', 'provider'])));
        Event::assertDispatched(InvoiceIssued::class);
        Event::assertDispatched(EInvoiceAccepted::class);

        // Misma Idempotency-Key: misma respuesta; otra clave: ya no está en borrador.
        $this->assertSame('F001-00000001', $this->postJson("/api/v1/admin/invoices/{$a['id']}/issue", [], $headers)->assertOk()->json('data.number'));
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$a['id']}/issue", [], $this->key()), 409, 'invalid_transition');

        // Boleta para DNI con su propia serie y correlativo.
        $receipt = $this->issue($this->orderInvoice($this->approvedOrder($this->dniCustomer, [['plan_id' => $this->hourly]]))['id']);
        $this->assertSame(['receipt', 'B001-00000001'], [$receipt['type'], $receipt['number']]);

        // Un número tomado en una emisión que se revierte vuelve a quedar libre: sin huecos.
        $series = DB::table('document_series')->where('series', 'F001')->value('id');
        try {
            DB::transaction(function () use ($series): void {
                $this->assertSame(2, app(DocumentNumberAllocator::class)->take($series));
                throw new RuntimeException('falla después de tomar el número');
            });
        } catch (RuntimeException) {
        }
        $numbers = [];
        foreach (range(1, 3) as $_) {
            $numbers[] = $this->issue($this->orderInvoice($this->approvedOrder(items: [['plan_id' => $this->hourly]]))['id'])['correlative'];
        }
        $this->assertSame([2, 3, 4], $numbers);
        $this->assertSame(5, DB::table('document_series')->where('id', $series)->value('next_number'));

        // Duplicado imposible: la restricción única (entidad, serie, número) lo rechaza.
        $second = DB::table('invoices')->where('series', 'F001')->where('number', 2)->value('id');
        $this->expectException(QueryException::class);
        DB::transaction(fn () => DB::table('invoices')->where('id', $second)->update(['number' => 1]));
    }

    public function test_series_missing_void_and_simulated_connector_guards(): void
    {
        $draft = $this->orderInvoice($this->approvedOrder($this->dniCustomer, [['plan_id' => $this->hourly]]));
        $receiptSeries = DB::table('document_series')->where('series', 'B001')->first();
        $this->patchJson("/api/v1/admin/document-series/{$receiptSeries->id}", ['version' => $receiptSeries->version, 'is_active' => false])->assertOk();
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$draft['id']}/issue", [], $this->key()), 409, 'series_missing');
        $this->assertSame(1, DB::table('document_series')->where('id', $receiptSeries->id)->value('next_number'));

        // Motivo obligatorio; un borrador no se anula (el esquema exige número fuera de `draft`).
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$draft['id']}/void", [], $this->key()), 422, 'validation_failed');
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$draft['id']}/void", ['reason' => 'Error de carga'], $this->key()), 409, 'invalid_transition');

        // Emitido y aceptado sin pagos: anulación con comunicación de baja simulada.
        $issued = $this->issue($this->orderInvoice($this->approvedOrder())['id']);
        $void = $this->postJson("/api/v1/admin/invoices/{$issued['id']}/void", ['reason' => 'Emitido por error'], $this->key())->assertOk()->json('data');
        $this->assertSame(['void', 'voided', 0, 'Emitido por error'], [$void['status'], $void['fiscal_status'], $void['balance_minor'], $void['void_reason']]);
        $this->assertTrue(DB::table('einvoice_submissions')->where('invoice_id', $issued['id'])->where('operation', 'void')->where('status', 'accepted')->exists());
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$issued['id']}/void", ['reason' => 'Otra vez'], $this->key()), 409, 'invalid_transition');

        // El conector simulado rechaza a propósito y no opera en producción.
        $fake = new FakeEInvoiceConnector;
        $doc = ['series' => 'F001', 'number' => 9, 'type_label' => 'Factura electrónica', 'issuer' => ['tax_id' => '20000000001']];
        $this->assertSame('rejected', $fake->submit($doc + ['total_minor' => FakeEInvoiceConnector::REJECT_TOTAL_MINOR], 'k')['status']);
        $this->app['env'] = 'production';
        $this->assertSame('error', $fake->submit($doc + ['total_minor' => 100], 'k')['status']);
        $this->app['env'] = 'testing';

        // Permisos: ventas ve comprobantes pero no emite ni anula.
        $sales = $this->makeUser(['sales'], mfa: true);
        $other = $this->orderInvoice($this->approvedOrder());
        $this->actAs($sales);
        $this->getJson("/api/v1/admin/invoices/{$other['id']}")->assertOk();
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$other['id']}/issue", [], $this->key()), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$other['id']}/void", ['reason' => 'No'], $this->key()), 403, 'forbidden');
    }

    public function test_printable_document_with_mandatory_data(): void
    {
        $this->assertSame('CIEN', AmountInWords::words(100));
        $this->assertSame('MIL UNO', AmountInWords::words(1001));
        $this->assertSame('VEINTIÚN MIL QUINIENTOS', AmountInWords::words(21500));
        $this->assertSame('UN MILLÓN DOSCIENTOS MIL', AmountInWords::words(1_200_000));
        $this->assertSame('SON: CERO CON 05/100 DÓLARES AMERICANOS', AmountInWords::format(5, 'USD'));

        $invoice = $this->issue($this->orderInvoice($this->approvedOrder())['id']);
        $response = $this->get("/api/v1/admin/invoices/{$invoice['id']}/document")->assertOk();
        $this->assertStringStartsWith('text/html', (string) $response->headers->get('Content-Type'));
        $html = $response->getContent();
        foreach (['FACTURA ELECTRÓNICA', 'F001-00000001', 'RUC 20000000001', 'Emisora de Prueba SAC', 'Cliente RUC SAC', self::ruc(7), 'Soles (PEN)',
            'IGV (18 %)', 'S/ 226.91', '192.30', '34.61', 'SON: DOSCIENTOS VEINTISÉIS CON 91/100 SOLES', 'SIMULACIÓN'] as $text) {
            $this->assertStringContainsString($text, $html, $text);
        }
        $download = $this->get("/api/v1/admin/invoices/{$invoice['id']}/document?download=1")->assertOk();
        $this->assertStringContainsString('attachment; filename="F001-00000001.html"', (string) $download->headers->get('Content-Disposition'));
    }

    public function test_renewal_job_drafts_once_per_subscription_period(): void
    {
        $order = $this->approvedOrder(items: [['plan_id' => $this->monthly, 'quantity' => 2]]);
        $serviceId = DB::table('services')->where('plan_id', $this->monthly)->value('id');
        $this->postJson("/api/v1/admin/services/{$serviceId}/activate", [], $this->key())->assertOk();
        $next = DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date');

        // Fuera de la ventana (3 días) no genera; dentro (30 por defecto) sí, una sola vez.
        $this->travelTo(now()->parse($next)->subDays(5));
        $this->setSetting('billing.invoice_generation_days', 3);
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 0')->assertSuccessful();
        $this->setSetting('billing.invoice_generation_days', 30);
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 1')->assertSuccessful();
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 0')->assertSuccessful();

        $renewal = DB::table('invoices')->whereRaw("custom->>'origin' = 'renewal'")->first();
        $this->assertSame(['draft', 3980, 716, 4696, $next], [$renewal->status, (int) $renewal->subtotal_minor, (int) $renewal->tax_minor, (int) $renewal->total_minor, $renewal->due_date]);
        $line = DB::table('invoice_items')->where('invoice_id', $renewal->id)->first();
        $this->assertSame([$serviceId, $next], [$line->service_id, $line->period_start]);
        $this->assertNotNull($line->subscription_id);
        $this->assertSame(\App\Modules\Services\Support\Cycle::add($next, 'monthly'), DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date'));
        $this->assertSame(2, DB::table('invoices')->count(), 'inicial + renovación');

        // Servicio suspendido: su suscripción pausada no genera; con auto_issue la renovación sale numerada.
        $this->travelTo(now()->parse(\App\Modules\Services\Support\Cycle::add($next, 'monthly'))->subDays(2));
        $this->postJson("/api/v1/admin/services/{$serviceId}/suspend", ['reason' => 'Prueba'], $this->key())->assertOk();
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 0')->assertSuccessful();
        $this->postJson("/api/v1/admin/services/{$serviceId}/reactivate", ['reason' => 'Prueba'], $this->key())->assertOk();
        config(['hub.billing.auto_issue' => true]);
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 1')->assertSuccessful();
        $this->assertSame(1, DB::table('invoices')->whereRaw("custom->>'origin' = 'renewal'")->where('status', 'issued')->where('fiscal_status', 'accepted')->count());
        $this->assertNotNull($order);
    }

    /** Revisión 22-10: anular una renovación devuelve el periodo al job; la inicial vence a los N días; el pedido anulado no se cobra. */
    public function test_void_renewal_rewinds_subscription_initial_due_days_and_order_cancel_voids(): void
    {
        $this->setSetting('billing.initial_invoice_due_days', 7);
        $initial = $this->issue($this->orderInvoice($this->approvedOrder(items: [['plan_id' => $this->hourly]]))['id']);
        $this->assertSame(now()->addDays(7)->toDateString(), $initial['due_date'], 'factura inicial: emisión + plazo');

        $this->approvedOrder(items: [['plan_id' => $this->monthly, 'quantity' => 1]]);
        $serviceId = DB::table('services')->where('plan_id', $this->monthly)->value('id');
        $this->postJson("/api/v1/admin/services/{$serviceId}/activate", [], $this->key())->assertOk();
        $next = DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date');
        $this->travelTo(now()->parse($next)->subDays(5));
        config(['hub.billing.auto_issue' => true]);
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 1')->assertSuccessful();
        $renewal = DB::table('invoices')->whereRaw("custom->>'origin' = 'renewal'")->first();
        $this->assertSame([$next, $next], [$renewal->due_date, DB::table('invoice_items')->where('invoice_id', $renewal->id)->value('period_start')], 'la renovación vence al inicio del periodo');
        $after = \App\Modules\Services\Support\Cycle::add($next, 'monthly');
        $this->assertSame($after, DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date'));

        // Anulada por error de datos: la suscripción vuelve al periodo anulado y el job lo factura de nuevo.
        $this->postJson("/api/v1/admin/invoices/{$renewal->id}/void", ['reason' => 'Dato erróneo'], $this->key())->assertOk()->assertJsonPath('data.status', 'void');
        $this->assertSame($next, DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date'));
        $this->artisan('hub:billing:renewals')->expectsOutputToContain('creados: 1')->assertSuccessful();
        $again = DB::table('invoices')->whereRaw("custom->>'origin' = 'renewal'")->where('status', 'issued')->first();
        $this->assertSame($next, DB::table('invoice_items')->where('invoice_id', $again->id)->value('period_start'));
        $this->assertSame($after, DB::table('subscriptions')->where('service_id', $serviceId)->value('next_invoice_date'));

        // Pedido aprobado por error y anulado: comprobante emitido sin pagos → void; servicios pendientes → cancelled.
        $order = $this->approvedOrder($this->dniCustomer, [['plan_id' => $this->monthly, 'quantity' => 1]]);
        $invoice = $this->orderInvoice($order);
        $this->assertSame('issued', $invoice['status']);
        $this->postJson("/api/v1/admin/orders/{$order['id']}/cancel", ['reason' => 'Aprobado por error'], $this->key())->assertOk();
        $this->assertSame(['void', 0], [DB::table('invoices')->where('id', $invoice['id'])->value('status'), (int) DB::table('invoices')->where('id', $invoice['id'])->value('balance_minor')]);
        $this->assertSame('cancelled', DB::table('services')->where('customer_id', $this->dniCustomer)->value('status'));
        $this->assertTrue(DB::table('audit_events')->where('action', 'service.cancelled')->where('metadata->reason', 'Pedido anulado')->exists());

        // Pedido con borrador (sin auto_issue): el borrador se descarta.
        config(['hub.billing.auto_issue' => false]);
        $draftOrder = $this->approvedOrder($this->dniCustomer, [['plan_id' => $this->hourly]]);
        $draft = $this->orderInvoice($draftOrder);
        $this->postJson("/api/v1/admin/orders/{$draftOrder['id']}/cancel", ['reason' => 'Desistió'], $this->key())->assertOk();
        $this->assertSame(0, DB::table('invoices')->where('id', $draft['id'])->count());
        $this->assertSame(0, DB::table('invoice_items')->where('invoice_id', $draft['id'])->count());
        $this->assertTrue(DB::table('audit_events')->where('action', 'invoice.discarded')->where('entity_id', $draft['id'])->exists());
    }

    public function test_portal_sees_only_own_issued_invoices(): void
    {
        $mine = $this->issue($this->orderInvoice($this->approvedOrder())['id']);
        $draft = $this->orderInvoice($this->approvedOrder(items: [['plan_id' => $this->hourly]]));
        $foreign = $this->issue($this->orderInvoice($this->approvedOrder($this->dniCustomer, [['plan_id' => $this->hourly]]))['id']);
        $user = $this->portalUser($this->rucCustomer, 'portal@cliente-ruc.pe');

        $this->actAs($user);
        $list = $this->getJson('/api/v1/portal/invoices')->assertOk()->json('data');
        $this->assertSame([$mine['id']], array_column($list, 'id'));
        $this->assertSame($mine['balance_minor'], $list[0]['balance_minor']);
        $this->assertArrayNotHasKey('origin', $list[0]);
        $this->assertArrayNotHasKey('notes', $list[0]);
        $this->getJson("/api/v1/portal/invoices/{$mine['id']}")->assertOk()->assertJsonPath('data.number', 'F001-00000001');
        $this->assertStringContainsString('F001-00000001', $this->get("/api/v1/portal/invoices/{$mine['id']}/document?download=1")->assertOk()->getContent());
        foreach ([$foreign['id'], $draft['id']] as $id) {
            $this->assertProblem($this->getJson("/api/v1/portal/invoices/{$id}"), 404, 'not_found');
            $this->assertProblem($this->getJson("/api/v1/portal/invoices/{$id}/document"), 404, 'not_found');
        }
        $this->assertProblem($this->getJson('/api/v1/admin/invoices'), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$draft['id']}/issue", [], $this->key()), 403, 'forbidden');
    }
}
