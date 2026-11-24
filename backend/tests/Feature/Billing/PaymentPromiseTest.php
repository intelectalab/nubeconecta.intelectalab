<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Shared\Audit\AuditLogger;
use Illuminate\Support\Facades\DB;

/** Compromisos de pago (billing.payment_promise.*): alta sobre un comprobante con saldo y cierre kept/broken. */
final class PaymentPromiseTest extends SalesFlowTestCase
{
    private const BASE = '/api/v1/admin/collections/promises';

    /** @return array<string, mixed> comprobante emitido (status issued, saldo = total) */
    private function issuedInvoice(): array
    {
        $order = $this->approvedOrder(items: [['plan_id' => $this->hourly]]);
        $id = DB::table('invoices')->whereRaw("custom->>'order_id' = ?", [$order['id']])->value('id');

        return $this->postJson("/api/v1/admin/invoices/{$id}/issue", [], $this->key())->assertOk()->json('data');
    }

    public function test_payment_promise_lifecycle(): void
    {
        $inv = $this->issuedInvoice();
        $this->assertSame('issued', $inv['status']);
        $this->assertGreaterThan(0, $inv['balance_minor']);

        $future = now()->addDays(5)->toDateString();
        $created = $this->postJson(self::BASE, ['invoice_id' => $inv['id'], 'promised_date' => $future, 'notes' => 'Paga el viernes'])
            ->assertCreated()
            ->assertJsonPath('data.status', 'open')
            ->assertJsonPath('data.amount_minor', $inv['balance_minor'])  // por defecto = saldo
            ->assertJsonPath('data.invoice.number', $inv['number'])
            ->json('data');

        // Segundo compromiso vigente para la misma factura → 422.
        $this->assertProblem($this->postJson(self::BASE, ['invoice_id' => $inv['id'], 'promised_date' => $future]), 422, 'validation_failed');

        // Listado filtrado y búsqueda por número de comprobante.
        $this->getJson(self::BASE.'?filter[status]=open')->assertOk()->assertJsonPath('data.0.id', $created['id']);
        $this->getJson(self::BASE.'?q='.urlencode($inv['number']))->assertOk()->assertJsonCount(1, 'data');

        // Cerrar como cumplido.
        $this->postJson(self::BASE."/{$created['id']}/resolve", ['version' => $created['version'], 'status' => 'kept'])
            ->assertOk()->assertJsonPath('data.status', 'kept');
        // Ya cerrado → 400.
        $this->assertProblem($this->postJson(self::BASE."/{$created['id']}/resolve", ['version' => $created['version'] + 1, 'status' => 'broken']), 400, 'bad_request');

        // Plazo mayor a 30 días → 422.
        $this->assertProblem($this->postJson(self::BASE, ['invoice_id' => $inv['id'], 'promised_date' => now()->addDays(40)->toDateString()]), 422, 'validation_failed');

        $this->assertNull(app(AuditLogger::class)->verify());
    }
}
