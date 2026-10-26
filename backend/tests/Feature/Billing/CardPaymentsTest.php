<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Modules\Billing\Events\InvoicePaid;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Facades\Http;

/** Pago con tarjeta: Mercado Pago Checkout Pro (preferencia, retorno, webhook firmado). */
final class CardPaymentsTest extends SalesFlowTestCase
{
    private const SECRET = 'whsec-test-only';

    /** @var array<string, array<string, mixed>> pagos que "tiene" la API de MP */
    private array $mp = [];

    private int $prefs = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'app.url' => 'https://api.hub.test',
            'hub.billing.card_gateway.driver' => 'mercadopago',
            'hub.billing.card_gateway.portal_url' => 'https://portal.hub.test',
            'hub.billing.card_gateway.mercadopago.access_token' => 'TEST-token-only',
            'hub.billing.card_gateway.mercadopago.webhook_secret' => self::SECRET,
            'hub.billing.card_gateway.mercadopago.sandbox' => true,
            'hub.billing.card_gateway.mercadopago.currencies' => 'PEN',
        ]);
        $this->app->forgetScopedInstances();
        Http::preventStrayRequests();
        Http::fake(function (HttpRequest $r) {
            if (preg_match('#/checkout/preferences/([^/?]+)$#', $r->url(), $m) === 1 && $r->method() === 'GET') {
                return Http::response(['id' => $m[1], 'init_point' => 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id='.$m[1], 'sandbox_init_point' => 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id='.$m[1]]);
            }
            if (str_ends_with($r->url(), '/checkout/preferences')) {
                return Http::response(['id' => 'pref-'.(++$this->prefs), 'init_point' => 'https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=p', 'sandbox_init_point' => 'https://sandbox.mercadopago.com.pe/checkout/v1/redirect?pref_id=p'], 201);
            }
            if (preg_match('#/v1/payments/(\d+)$#', $r->url(), $m) === 1) {
                return isset($this->mp[$m[1]]) ? Http::response($this->mp[$m[1]]) : Http::response(['message' => 'not found'], 404);
            }

            return Http::response([], 500);
        });
    }

    /** Comprobante emitido de 1 h de desarrollo (11 210). */
    private function invoice(?string $customer = null): array
    {
        $order = $this->approvedOrder($customer, [['plan_id' => $this->hourly]]);
        $id = DB::table('invoices')->whereRaw("custom->>'order_id' = ?", [$order['id']])->value('id');

        return $this->postJson("/api/v1/admin/invoices/{$id}/issue", [], $this->key())->assertOk()->json('data');
    }

    private function mpPayment(string $id, string $status, string $reference, float $amount = 112.10, string $currency = 'PEN', string $detail = 'accredited'): void
    {
        $this->mp[$id] = ['id' => (int) $id, 'status' => $status, 'status_detail' => $detail, 'external_reference' => $reference,
            'transaction_amount' => $amount, 'currency_id' => $currency, 'fee_details' => [['type' => 'mercadopago_fee', 'amount' => 4.6, 'fee_payer' => 'collector']]];
    }

    private function reference(string $checkoutId): string
    {
        $invoice = DB::table('payment_checkouts')->where('id', $checkoutId)->selectRaw('invoice_ids[1]::text as i')->value('i');

        return "inv:{$invoice}:chk:{$checkoutId}";
    }

    private function webhook(string $dataId, ?int $ts = null, ?string $secret = null): \Illuminate\Testing\TestResponse
    {
        $ts ??= time();
        $rid = 'req-'.$dataId.'-'.$ts;
        $sig = hash_hmac('sha256', "id:{$dataId};request-id:{$rid};ts:{$ts};", $secret ?? self::SECRET);

        return $this->postJson("/api/v1/webhooks/mercadopago?data.id={$dataId}&type=payment",
            ['id' => (int) ($ts.substr($dataId, -3)), 'action' => 'payment.updated', 'type' => 'payment', 'api_version' => 'v1', 'data' => ['id' => $dataId], 'live_mode' => false],
            ['x-signature' => "ts={$ts},v1={$sig}", 'x-request-id' => $rid]);
    }

    private function start(string $invoiceId): array
    {
        return $this->postJson("/api/v1/portal/invoices/{$invoiceId}/card-payment", [], $this->key())->assertCreated()->json('data');
    }

    private function balance(string $id): int
    {
        return (int) DB::table('invoices')->where('id', $id)->value('balance_minor');
    }

    public function test_preference_return_approved_idempotent_and_ownership(): void
    {
        Event::fake([InvoicePaid::class]);
        $mine = $this->invoice();
        $foreign = $this->invoice($this->dniCustomer);
        $user = $this->portalUser($this->rucCustomer, 'pagos@cliente-ruc.pe');
        $this->actAs($user);

        $this->getJson("/api/v1/portal/invoices/{$mine['id']}")->assertOk()->assertJsonPath('data.card_payment.available', true);
        $this->assertProblem($this->postJson("/api/v1/portal/invoices/{$foreign['id']}/card-payment", [], $this->key()), 404, 'not_found');

        $key = $this->key();
        $checkout = $this->postJson("/api/v1/portal/invoices/{$mine['id']}/card-payment", [], $key)->assertCreated()->json('data');
        $this->assertSame(['created', 11210, 0, 'PEN'], [$checkout['status'], $checkout['amount_minor'], $checkout['surcharge_minor'], $checkout['currency']]);
        $this->assertStringStartsWith('https://sandbox.mercadopago.com.pe/', $checkout['redirect_url']);
        $this->postJson("/api/v1/portal/invoices/{$mine['id']}/card-payment", [], $key)->assertCreated()->assertJsonPath('data.id', $checkout['id']);
        $ref = $this->reference($checkout['id']);
        Http::assertSent(fn (HttpRequest $r) => str_ends_with($r->url(), '/checkout/preferences') && $r->hasHeader('Authorization', 'Bearer TEST-token-only')
            && $r['external_reference'] === $ref && $r['items'][0]['unit_price'] == 112.1 && $r['items'][0]['currency_id'] === 'PEN'
            && $r['auto_return'] === 'approved' && $r['back_urls']['success'] === 'https://portal.hub.test/?card_return='.$checkout['id']
            && $r['notification_url'] === 'https://api.hub.test/api/v1/webhooks/mercadopago?source_news=webhooks');
        $this->assertSame(1, DB::table('payment_checkouts')->count());

        // Retorno: los parámetros de la URL no bastan; se consulta MP.
        $this->assertProblem($this->postJson("/api/v1/portal/card-payments/{$checkout['id']}/confirm", ['payment_id' => '999']), 404, 'not_found');
        $this->mpPayment('1001', 'approved', $ref);
        $done = $this->postJson("/api/v1/portal/card-payments/{$checkout['id']}/confirm", ['payment_id' => '1001', 'status' => 'approved'])->assertOk()->json('data');
        $this->assertSame('approved', $done['status']);
        $this->assertSame(0, $this->balance($mine['id']));
        $pay = DB::table('payments')->where('external_id', '1001')->first();
        $this->assertSame(['validated', 'webhook', null, 460], [$pay->status, $pay->reported_via, $pay->validated_by, (int) $pay->fee_minor]);
        Event::assertDispatched(InvoicePaid::class);

        // Webhook del mismo pago y retorno repetido: nunca un segundo pago.
        $this->webhook('1001')->assertOk();
        $this->webhook('1001')->assertOk();
        $this->postJson("/api/v1/portal/card-payments/{$checkout['id']}/confirm", ['collection_id' => '1001'])->assertOk()->assertJsonPath('data.status', 'approved');
        $this->assertSame(1, DB::table('payments')->where('external_id', '1001')->count());
        $this->getJson("/api/v1/portal/invoices/{$mine['id']}")->assertJsonPath('data.card_payment.available', false);
        $this->assertProblem($this->postJson("/api/v1/portal/invoices/{$mine['id']}/card-payment", [], $this->key()), 409, 'invoice_not_payable');

        // Intento ajeno: 404.
        $this->actAs($this->admin);
        $this->actAs($this->portalUser($this->dniCustomer, 'ana@cliente-dni.pe'));
        $this->assertProblem($this->getJson("/api/v1/portal/card-payments/{$checkout['id']}"), 404, 'not_found');
        $this->assertProblem($this->postJson("/api/v1/portal/card-payments/{$checkout['id']}/confirm", ['payment_id' => '1001']), 404, 'not_found');
        $audit = DB::table('audit_events')->where('action', 'like', 'payment_checkout.%')->pluck('metadata')->implode(' ');
        $this->assertStringNotContainsString('TEST-token-only', $audit);
    }

    /** Revisión 22-10: dos pestañas no crean dos preferencias; un cobro que llega con la factura ya pagada queda auditado para finanzas. */
    public function test_open_attempt_is_reused_and_unapplied_charge_is_flagged(): void
    {
        $mine = $this->invoice();
        $this->actAs($this->portalUser($this->rucCustomer, 'pagos@cliente-ruc.pe'));
        $a = $this->start($mine['id']);
        $b = $this->start($mine['id']); // otra Idempotency-Key (segunda pestaña o reintento)
        $this->assertSame($a['id'], $b['id']);
        $this->assertStringContainsString('pref_id=pref-1', $b['redirect_url']);
        $this->assertSame(1, DB::table('payment_checkouts')->count());
        $this->assertSame(1, Http::recorded(fn (HttpRequest $r) => str_ends_with($r->url(), '/checkout/preferences') && $r->method() === 'POST')->count());
        $this->assertTrue(DB::table('audit_events')->where('action', 'payment_checkout.reused')->exists());

        // Finanzas valida una transferencia mientras tanto; el cobro con tarjeta llega después: pago validado sin aplicar + auditoría.
        $this->actAs($this->admin);
        $method = collect($this->getJson('/api/v1/admin/payment-methods')->json('data'))->firstWhere('code', 'bank_transfer')['id'];
        $this->postJson('/api/v1/admin/payments', ['customer_id' => $this->rucCustomer, 'payment_method_id' => $method, 'amount_minor' => 11210, 'currency' => 'PEN',
            'validate' => true, 'allocations' => [['invoice_id' => $mine['id'], 'amount_minor' => 11210]]], $this->key())->assertCreated();
        $this->mpPayment('3001', 'approved', $this->reference($a['id']));
        $this->webhook('3001')->assertOk();
        $pay = DB::table('payments')->where('external_id', '3001')->first(['id', 'status', 'notes']);
        $this->assertSame('validated', $pay->status);
        $this->assertStringContainsString('REVISAR', (string) $pay->notes);
        $this->assertSame(0, DB::table('payment_allocations')->where('payment_id', $pay->id)->count());
        $this->assertSame(11210, (int) DB::table('audit_events')->where('action', 'payment_checkout.unapplied')->value('metadata->unapplied_minor'));
    }

    public function test_rejected_pending_and_manipulated_payments_do_not_touch_balance(): void
    {
        $mine = $this->invoice();
        $other = $this->invoice();
        $this->actAs($this->portalUser($this->rucCustomer, 'pagos@cliente-ruc.pe'));
        $a = $this->start($mine['id']);
        $b = $this->start($other['id']);

        $this->mpPayment('2001', 'rejected', $this->reference($a['id']), detail: 'cc_rejected_insufficient_amount');
        $r = $this->postJson("/api/v1/portal/card-payments/{$a['id']}/confirm", ['payment_id' => '2001'])->assertOk()->json('data');
        $this->assertSame(['declined', 'Fondos insuficientes.'], [$r['status'], $r['message']]);

        $this->mpPayment('2002', 'in_process', $this->reference($a['id']), detail: 'pending_contingency');
        $this->postJson("/api/v1/portal/card-payments/{$a['id']}/confirm", ['payment_id' => '2002'])->assertOk()->assertJsonPath('data.status', 'pending');

        // Importe manipulado (aprobado por menos) → sin pago, revisión manual.
        $this->mpPayment('2003', 'approved', $this->reference($a['id']), 1.00);
        $this->postJson("/api/v1/portal/card-payments/{$a['id']}/confirm", ['payment_id' => '2003'])->assertOk()->assertJsonPath('data.status', 'declined');
        // Moneda distinta.
        $this->mpPayment('2004', 'approved', $this->reference($b['id']), 112.10, 'USD');
        $this->webhook('2004')->assertOk();
        // external_reference de otro intento en el retorno de este: 404; ajena en webhook: se ignora.
        $this->mpPayment('2005', 'approved', $this->reference($b['id']));
        $this->assertProblem($this->postJson("/api/v1/portal/card-payments/{$a['id']}/confirm", ['payment_id' => '2005']), 404, 'not_found');
        $this->mpPayment('2006', 'approved', 'otro-sistema-123');
        $this->webhook('2006')->assertOk()->assertJsonPath('status', 'ignored');

        $this->assertSame([11210, 11210], [$this->balance($mine['id']), $this->balance($other['id'])]);
        $this->assertSame(0, DB::table('payments')->count());
        $this->assertSame('declined', DB::table('payment_checkouts')->where('id', $b['id'])->value('status'));

        // Un rechazo previo no impide aprobar después en el mismo intento (reintento en MP).
        $this->webhook('2005')->assertOk()->assertJsonPath('status', 'processed');
        $this->assertSame(0, $this->balance($other['id']));
    }

    public function test_webhook_signature_window_and_disabled_driver(): void
    {
        $mine = $this->invoice();
        $usd = $this->invoice();
        $other = $this->invoice();
        DB::table('invoices')->where('id', $usd['id'])->update(['currency' => 'USD']);
        $this->actAs($this->portalUser($this->rucCustomer, 'pagos@cliente-ruc.pe'));
        $c = $this->start($mine['id']);
        $this->mpPayment('3001', 'approved', $this->reference($c['id']));

        $this->assertProblem($this->webhook('3001', secret: 'otra-clave'), 401, 'invalid_signature');
        $this->assertProblem($this->webhook('3001', time() - 3600), 401, 'invalid_signature');
        $this->assertProblem($this->postJson('/api/v1/webhooks/mercadopago?data.id=3001&type=payment', ['type' => 'payment']), 401, 'invalid_signature');
        $this->assertSame(11210, $this->balance($mine['id']));
        $this->webhook('3001', (int) (microtime(true) * 1000))->assertOk()->assertJsonPath('status', 'processed');
        $this->assertSame(0, $this->balance($mine['id']));
        $this->assertSame(1, DB::table('webhook_events')->where('provider', 'card_gateway')->count());

        // USD no admitido por la cuenta → mensaje claro.
        $this->assertProblem($this->postJson("/api/v1/portal/invoices/{$usd['id']}/card-payment", [], $this->key()), 422, 'currency_not_supported');

        // Sin llaves: el portal oculta el botón y el endpoint lo rechaza.
        config(['hub.billing.card_gateway.mercadopago.access_token' => null]);
        $this->app->forgetScopedInstances();
        $this->getJson("/api/v1/portal/invoices/{$other['id']}")->assertJsonPath('data.card_payment.available', false);
        $this->assertProblem($this->postJson("/api/v1/portal/invoices/{$other['id']}/card-payment", [], $this->key()), 409, 'card_payment_unavailable');
        $this->assertProblem($this->webhook('3001'), 503, 'card_gateway_disabled');
    }
}
