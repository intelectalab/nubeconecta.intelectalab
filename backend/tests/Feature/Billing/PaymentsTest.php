<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Modules\Billing\Events\InvoicePaid;
use App\Modules\Billing\Events\PaymentRecorded;
use App\Modules\Billing\Events\PaymentReported;
use App\Modules\Billing\Services\CollectionsService;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Storage;

/** Pagos, vouchers del portal y cobranza (M-BIL franja MVP). */
final class PaymentsTest extends SalesFlowTestCase
{
    /** Comprobante emitido de 1 h de desarrollo (9 500 + IGV = 11 210). */
    private function invoice(?string $customer = null): array
    {
        $order = $this->approvedOrder($customer, [['plan_id' => $this->hourly]]);
        $id = DB::table('invoices')->whereRaw("custom->>'order_id' = ?", [$order['id']])->value('id');

        return $this->postJson("/api/v1/admin/invoices/{$id}/issue", [], $this->key())->assertOk()->json('data');
    }

    private function method(string $code = 'bank_transfer'): string
    {
        $methods = $this->getJson('/api/v1/admin/payment-methods')->assertOk()->json('data');

        return collect($methods)->firstWhere('code', $code)['id'];
    }

    /** @param list<array{0: string, 1: int}> $alloc */
    private function pay(int $amount, array $alloc, bool $validate = true, ?string $ref = null, ?string $customer = null): \Illuminate\Testing\TestResponse
    {
        return $this->postJson('/api/v1/admin/payments', [
            'customer_id' => $customer ?? $this->rucCustomer, 'payment_method_id' => $this->method(), 'amount_minor' => $amount, 'currency' => 'PEN',
            'received_at' => now()->toDateString(), 'external_id' => $ref, 'validate' => $validate,
            'allocations' => array_map(fn ($a) => ['invoice_id' => $a[0], 'amount_minor' => $a[1]], $alloc),
        ], $this->key());
    }

    private function invoiceRow(string $id): object
    {
        return DB::table('invoices')->where('id', $id)->first(['status', 'balance_minor', 'total_minor', 'paid_at']);
    }

    public function test_partial_then_total_allocation_marks_paid_and_void_reverts(): void
    {
        Event::fake([InvoicePaid::class, PaymentRecorded::class]);
        $inv = $this->invoice();
        $total = $inv['total_minor'];
        $this->assertSame(11210, $total);

        $first = $this->pay(5000, [[$inv['id'], 5000]], ref: 'OP-1')->assertCreated()->json('data');
        $this->assertSame(['validated', 5000, 'finance'], [$first['status'], $first['allocated_minor'], $first['reported_via']]);
        $row = $this->invoiceRow($inv['id']);
        $this->assertSame(['partially_paid', $total - 5000], [$row->status, (int) $row->balance_minor]);
        Event::assertNotDispatched(InvoicePaid::class);

        $this->assertProblem($this->pay(100, [[$inv['id'], 100]], ref: 'OP-1'), 409, 'duplicate_reference');
        $over = $this->pay(99999, [[$inv['id'], $total]]);
        $this->assertProblem($over, 422, 'validation_failed');
        $this->assertArrayHasKey('allocations.0.amount_minor', $over->json('errors'));

        // Excedente: se aplica solo el saldo; el resto queda sin aplicar.
        $second = $this->pay($total - 5000 + 300, [[$inv['id'], $total - 5000]], ref: 'OP-2')->assertCreated()->json('data');
        $row = $this->invoiceRow($inv['id']);
        $this->assertSame(['paid', 0], [$row->status, (int) $row->balance_minor]);
        $this->assertNotNull($row->paid_at);
        Event::assertDispatchedTimes(InvoicePaid::class, 1);
        Event::assertDispatched(PaymentRecorded::class);
        $this->getJson("/api/v1/admin/invoices/{$inv['id']}")->assertOk()->assertJsonCount(2, 'data.payments')->assertJsonPath('data.status', 'paid');

        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$second['id']}/void", [], $this->key()), 422, 'validation_failed');
        $voided = $this->postJson("/api/v1/admin/payments/{$second['id']}/void", ['reason' => 'Registro duplicado'], $this->key())->assertOk()->json('data');
        $this->assertSame(['rejected', true], [$voided['status'], $voided['voided']]);
        $row = $this->invoiceRow($inv['id']);
        $this->assertSame(['partially_paid', $total - 5000], [$row->status, (int) $row->balance_minor]);
        $this->assertNull($row->paid_at);
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$second['id']}/void", ['reason' => 'Otra vez'], $this->key()), 409, 'invalid_transition');
        $this->assertTrue(DB::table('audit_events')->where('action', 'payment.voided')->where('entity_id', $second['id'])->exists());
        $this->assertProblem($this->postJson('/api/v1/admin/payments', ['customer_id' => $this->rucCustomer]), 400, 'bad_request');
    }

    public function test_one_payment_across_invoices_and_ownership_currency_guards(): void
    {
        $a = $this->invoice();
        $b = $this->invoice();
        $foreign = $this->invoice($this->dniCustomer);

        $payment = $this->pay(15000, [[$a['id'], 11210], [$b['id'], 3790]])->assertCreated()->json('data');
        $this->assertCount(2, $payment['allocations']);
        $this->assertSame('paid', $this->invoiceRow($a['id'])->status);
        $this->assertSame([7420, 'partially_paid'], [(int) $this->invoiceRow($b['id'])->balance_minor, $this->invoiceRow($b['id'])->status]);

        $bad = $this->pay(100, [[$foreign['id'], 100]]);
        $this->assertProblem($bad, 422, 'validation_failed');
        $this->assertArrayHasKey('allocations.0.invoice_id', $bad->json('errors'));
        $sum = $this->pay(100, [[$b['id'], 60], [$b['id'], 60]]);
        $this->assertProblem($sum, 422, 'validation_failed');
        $usd = $this->postJson('/api/v1/admin/payments', ['customer_id' => $this->rucCustomer, 'payment_method_id' => $this->method(), 'amount_minor' => 100, 'currency' => 'USD', 'allocations' => [['invoice_id' => $b['id'], 'amount_minor' => 100]]], $this->key());
        $this->assertArrayHasKey('allocations.0.invoice_id', $usd->assertStatus(422)->json('errors'));
        $card = $this->postJson('/api/v1/admin/payments', ['customer_id' => $this->rucCustomer, 'payment_method_id' => DB::table('payment_methods')->where('code', 'card_gateway')->value('id'), 'amount_minor' => 100, 'currency' => 'PEN'], $this->key());
        $this->assertArrayHasKey('payment_method_id', $card->assertStatus(422)->json('errors'));
    }

    public function test_permissions_sales_reports_and_no_self_validation(): void
    {
        $inv = $this->invoice();
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actAs($sales);
        $this->assertProblem($this->pay(1000, [[$inv['id'], 1000]], validate: true), 403, 'forbidden');
        $reported = $this->pay(1000, [[$inv['id'], 1000]], validate: false)->assertCreated()->json('data');
        $this->assertSame(['reported', 'sales'], [$reported['status'], $reported['reported_via']]);
        $this->assertSame($inv['total_minor'], (int) $this->invoiceRow($inv['id'])->balance_minor);
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$reported['id']}/validate", [], $this->key()), 403, 'forbidden');
        $this->getJson('/api/v1/admin/collections/aging')->assertOk();
    }

    public function test_admin_cannot_validate_own_reported_payment_but_finance_can(): void
    {
        $inv = $this->invoice();
        $own = $this->pay(2000, [[$inv['id'], 2000]], validate: false)->assertCreated()->json('data');
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$own['id']}/validate", [], $this->key()), 403, 'self_validation');

        $finance = $this->makeUser(['finance'], mfa: true);
        $this->actAs($finance);
        $this->postJson("/api/v1/admin/payments/{$own['id']}/validate", [], $this->key())->assertOk()->assertJsonPath('data.status', 'validated');
        $this->assertSame($inv['total_minor'] - 2000, (int) $this->invoiceRow($inv['id'])->balance_minor);
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$own['id']}/reject", ['reason' => 'tarde'], $this->key()), 409, 'invalid_transition');

        $this->actAs($this->makeUser(['external_accountant'], mfa: true));
        $this->getJson('/api/v1/admin/payments')->assertOk()->assertJsonCount(1, 'data');
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$own['id']}/void", ['reason' => 'x y z'], $this->key()), 403, 'forbidden');
    }

    public function test_portal_voucher_upload_review_and_idor(): void
    {
        Storage::fake('local');
        Event::fake([PaymentReported::class, InvoicePaid::class]);
        $mine = $this->invoice();
        $second = $this->invoice();
        $foreign = $this->invoice($this->dniCustomer);
        $user = $this->portalUser($this->rucCustomer, 'pagos@cliente-ruc.pe');
        $other = $this->portalUser($this->dniCustomer, 'ana@cliente-dni.pe');

        $this->actAs($user);
        $methods = $this->getJson('/api/v1/portal/payment-methods')->assertOk()->json('data');
        $this->assertNotContains('card_gateway', array_column($methods, 'code'));
        $method = collect($methods)->firstWhere('code', 'bank_transfer')['id'];
        $send = fn (string $invoice, UploadedFile $file, int $amount = 11210, string $ref = 'TX-1') => $this->post("/api/v1/portal/invoices/{$invoice}/vouchers",
            ['payment_method_id' => $method, 'amount_minor' => $amount, 'external_id' => $ref, 'received_at' => now()->toDateString(), 'file' => $file],
            $this->key() + ['Accept' => 'application/json']);

        $bad = $send($mine['id'], UploadedFile::fake()->create('virus.exe', 10, 'application/x-msdownload'));
        $this->assertProblem($bad, 422, 'validation_failed');
        $this->assertArrayHasKey('file', $bad->json('errors'));
        $this->assertArrayHasKey('file', $send($mine['id'], UploadedFile::fake()->create('grande.pdf', 6000, 'application/pdf'))->assertStatus(422)->json('errors'));
        $this->assertProblem($send($foreign['id'], UploadedFile::fake()->create('v.pdf', 20, 'application/pdf')), 404, 'not_found');

        $voucher = $send($mine['id'], UploadedFile::fake()->create('Constancia BCP.pdf', 40, 'application/pdf'))->assertCreated()->json('data');
        $this->assertSame(['reported', 'portal', true], [$voucher['status'], $voucher['reported_via'], $voucher['has_proof']]);
        $this->assertArrayNotHasKey('notes', $voucher);
        $this->assertSame($mine['total_minor'], (int) $this->invoiceRow($mine['id'])->balance_minor); // RN-BIL-050
        Event::assertDispatched(PaymentReported::class);
        $file = DB::table('files')->where('id', DB::table('payments')->where('id', $voucher['id'])->value('proof_file_id'))->first();
        $org = DB::table('organizations')->value('id');
        $this->assertStringStartsWith("{$org}/payment-proofs/", $file->path);
        $this->assertStringNotContainsString('BCP', $file->path);
        Storage::disk('local')->assertExists($file->path);
        $rejected = $send($second['id'], UploadedFile::fake()->image('voucher.png'), 5000, 'TX-2')->assertCreated()->json('data');
        $this->get("/api/v1/portal/payments/{$voucher['id']}/proof")->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');
        $this->getJson('/api/v1/portal/summary')->assertOk()->assertJsonPath('data.pending_vouchers', 2)->assertJsonPath('data.debt.0.balance_minor', 22420);

        // Otro cliente: ni el pago ni su constancia (IDOR).
        $this->actAs($other);
        $this->assertProblem($this->getJson("/api/v1/portal/payments/{$voucher['id']}"), 404, 'not_found');
        $this->assertProblem($this->getJson("/api/v1/portal/payments/{$voucher['id']}/proof"), 404, 'not_found');
        $this->getJson('/api/v1/portal/payments')->assertOk()->assertJsonCount(0, 'data');
        $this->assertProblem($this->getJson("/api/v1/admin/payments/{$voucher['id']}/proof"), 403, 'forbidden');

        // Finanzas: cola de vouchers, aprobar y rechazar con motivo.
        $this->actAs($this->makeUser(['finance'], mfa: true));
        $queue = $this->getJson('/api/v1/admin/payments?filter[status]=reported')->assertOk()->json('data');
        $this->assertEqualsCanonicalizing([$voucher['id'], $rejected['id']], array_column($queue, 'id'));
        $this->get("/api/v1/admin/payments/{$voucher['id']}/proof")->assertOk();
        $this->postJson("/api/v1/admin/payments/{$voucher['id']}/validate", [], $this->key())->assertOk()->assertJsonPath('data.status', 'validated');
        $this->assertSame(['paid', 0], [$this->invoiceRow($mine['id'])->status, (int) $this->invoiceRow($mine['id'])->balance_minor]);
        Event::assertDispatched(InvoicePaid::class);
        $this->assertProblem($this->postJson("/api/v1/admin/payments/{$rejected['id']}/reject", [], $this->key()), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/payments/{$rejected['id']}/reject", ['reason' => 'No figura en el banco'], $this->key())->assertOk()
            ->assertJsonPath('data.status', 'rejected')->assertJsonPath('data.voided', false);
        $this->assertSame($second['total_minor'], (int) $this->invoiceRow($second['id'])->balance_minor);

        // El cliente ve su historial y el detalle del comprobante con sus pagos.
        $this->actAs($user);
        $history = $this->getJson('/api/v1/portal/payments')->assertOk()->json('data');
        $this->assertCount(2, $history);
        $this->assertSame('No figura en el banco', collect($history)->firstWhere('id', $rejected['id'])['rejection_reason']);
        $this->getJson("/api/v1/portal/invoices/{$mine['id']}")->assertOk()->assertJsonPath('data.payments.0.status', 'validated')->assertJsonPath('data.status', 'paid');
        $this->assertProblem($send($mine['id'], UploadedFile::fake()->create('otra.pdf', 10, 'application/pdf'), 100, 'TX-3'), 409, 'invoice_not_payable');
    }

    /** Revisión 22-10: un voucher pendiente no se "valida" contra un comprobante anulado ni pagado; rechazarlo libera su referencia. */
    public function test_validate_rechecks_allocations_void_guard_and_rejected_reference_is_reusable(): void
    {
        $a = $this->invoice();
        $reported = $this->pay(11210, [[$a['id'], 11210]], validate: false, ref: 'OP-77')->assertCreated()->json('data');
        $this->assertSame('reported', $reported['status']);

        // Con un voucher por validar aplicado, el comprobante no se anula.
        $this->assertProblem($this->postJson("/api/v1/admin/invoices/{$a['id']}/void", ['reason' => 'Error'], $this->key()), 409, 'invoice_has_pending_payments');

        // Otro pago lo deja pagado: validar el voucher guardado ya no puede aplicarse (422), el pago sigue `reported`.
        $this->actAs($this->makeUser(['finance'], mfa: true));
        $this->pay(11210, [[$a['id'], 11210]], ref: 'OP-78')->assertCreated();
        $this->assertSame('paid', $this->invoiceRow($a['id'])->status);
        $stale = $this->postJson("/api/v1/admin/payments/{$reported['id']}/validate", [], $this->key());
        $this->assertProblem($stale, 422, 'validation_failed');
        $this->assertArrayHasKey('allocations.0.invoice_id', $stale->json('errors'));
        $this->assertSame('reported', DB::table('payments')->where('id', $reported['id'])->value('status'));

        // Rechazado: la referencia queda libre (en notas) y el cliente puede reenviar la constancia con la misma operación.
        $this->postJson("/api/v1/admin/payments/{$reported['id']}/reject", ['reason' => 'Constancia equivocada'], $this->key())->assertOk();
        $row = DB::table('payments')->where('id', $reported['id'])->first(['external_id', 'notes']);
        $this->assertNull($row->external_id);
        $this->assertStringContainsString('OP-77', (string) $row->notes);
        $this->actAs($this->admin);
        $b = $this->invoice();
        $this->pay(11210, [[$b['id'], 11210]], validate: false, ref: 'OP-77')->assertCreated();
        $this->assertProblem($this->pay(100, [[$b['id'], 100]], validate: false, ref: 'OP-77'), 409, 'duplicate_reference');
    }

    public function test_aging_buckets_overdue_job_and_dunning_notices(): void
    {
        foreach ([[0, 'current'], [-5, 'current'], [1, 'd1_30'], [30, 'd1_30'], [31, 'd31_60'], [60, 'd31_60'], [61, 'd61_90'], [90, 'd61_90'], [91, 'd90_plus']] as [$days, $bucket]) {
            $this->assertSame($bucket, CollectionsService::bucket(now()->subDays($days)->toDateString(), now()->toDateString()), "{$days} días");
        }
        $this->assertSame('current', CollectionsService::bucket(null, now()->toDateString()));

        $due = [5 => null, -10 => null, -45 => null, -100 => null];
        foreach (array_keys($due) as $offset) {
            $due[$offset] = $this->invoice()['id'];
            DB::table('invoices')->where('id', $due[$offset])->update(['due_date' => now()->addDays($offset)->toDateString()]);
        }
        $this->pay(1210, [[$due[-10], 1210]])->assertCreated();
        $this->artisan('hub:billing:dunning')->assertSuccessful();
        $this->assertSame('issued', $this->invoiceRow($due[5])->status);
        $this->assertSame('overdue', $this->invoiceRow($due[-10])->status);
        $this->assertSame('overdue', $this->invoiceRow($due[-100])->status);

        $aging = $this->getJson("/api/v1/admin/collections/aging?filter[customer_id]={$this->rucCustomer}")->assertOk();
        $row = $aging->json('data.0');
        $this->assertSame(['current' => 11210, 'd1_30' => 10000, 'd31_60' => 11210, 'd61_90' => 0, 'd90_plus' => 11210], $row['buckets']);
        $this->assertSame([43630, 32420, 4], [$row['total_minor'], $row['overdue_minor'], $row['invoices']]);
        $this->assertNotNull($row['last_payment_at']);
        $this->assertSame(43630, $aging->json('meta.totals.0.total_minor'));

        // Un aviso por comprobante (la etapa más reciente ya cumplida), sin duplicar al repetir.
        $events = DB::table('dunning_events')->join('dunning_stages', 'dunning_stages.id', '=', 'dunning_events.dunning_stage_id')
            ->pluck('dunning_stages.offset_days', 'dunning_events.invoice_id');
        $this->assertSame(-7, (int) $events[$due[5]]);
        $this->assertSame(1, (int) $events[$due[-10]]);
        $this->assertCount(4, $events);
        $this->artisan('hub:billing:dunning')->assertSuccessful();
        $this->assertSame(4, DB::table('dunning_events')->count());
        $notice = $this->getJson('/api/v1/admin/collections/dunning-events')->assertOk()->json('data.0');
        $this->assertSame(['send_notice', 'scheduled', 'pending_channel'], [$notice['action'], $notice['status'], $notice['detail']['delivery']]);
        $this->assertSame(0, DB::table('dunning_events')->where('action', 'suspend_service')->count());

        $this->actAs($this->makeUser(['support'], mfa: true));
        $this->assertProblem($this->getJson('/api/v1/admin/collections/aging'), 403, 'forbidden');
    }
}
