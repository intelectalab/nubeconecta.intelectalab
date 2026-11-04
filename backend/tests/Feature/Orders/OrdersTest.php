<?php

declare(strict_types=1);

namespace Tests\Feature\Orders;

use App\Models\User;
use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Orders\Events\OrderCancelled;
use App\Modules\Orders\Services\OrderTotals;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/** Franja MVP de M-ORD: precio congelado, totales con IGV, estados, permisos, idempotencia y aislamiento. */
final class OrdersTest extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    private User $admin;

    private string $brand;

    private string $customer;

    private string $monthly;

    private string $hourly;

    private string $hourlyProduct;

    private int $key = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $org = DB::table('organizations')->value('id');
        DB::table('tax_rates')->insert(['organization_id' => $org, 'code' => 'igv', 'name' => 'IGV', 'rate_percent' => '18.0000', 'effective_from' => '2011-03-01']);
        $entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Entidad de Prueba SAC', 'tax_id' => '20000000001'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'Marca A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $entity])->assertCreated()->json('data.id');
        $this->customer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente Demo SAC', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');

        $category = $this->postJson('/api/v1/admin/product-categories', ['code' => 'hosting', 'name' => 'Hosting', 'kind' => 'shared_hosting'])->assertCreated()->json('data.id');
        $hosting = $this->postJson('/api/v1/admin/products', ['code' => 'HOST', 'category_id' => $category, 'brand_id' => $this->brand, 'name' => 'Hosting Emprendedor', 'billing_type' => 'recurring'])->assertCreated()->json('data.id');
        $this->monthly = $this->postJson('/api/v1/admin/plans', ['product_id' => $hosting, 'code' => 'host-m', 'name' => 'Mensual', 'cycle' => 'monthly'])->assertCreated()->json('data.id');
        $this->hourlyProduct = $this->postJson('/api/v1/admin/products', ['code' => 'DEV', 'category_id' => $category, 'name' => 'Desarrollo', 'billing_type' => 'one_time', 'export_eligible' => true])->assertCreated()->json('data.id');
        $this->hourly = $this->postJson('/api/v1/admin/plans', ['product_id' => $this->hourlyProduct, 'code' => 'dev-h', 'name' => 'Hora', 'cycle' => 'one_time', 'limits' => ['billing_unit' => 'hour']])->assertCreated()->json('data.id');
        $from = now()->subDay()->toDateString();
        foreach ([[$this->monthly, 'PEN', 1990], [$this->monthly, 'USD', 590], [$this->hourly, 'PEN', 9500]] as [$plan, $currency, $price]) {
            $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $plan, 'currency' => $currency, 'price_minor' => $price, 'effective_from' => $from])->assertCreated();
        }
    }

    private function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    private function key(): array
    {
        return ['Idempotency-Key' => 'ord-test-'.(++$this->key).'-'.Str::random(8)];
    }

    /** @param array<string, mixed> $extra */
    private function order(array $extra = []): array
    {
        return $this->postJson('/api/v1/admin/orders', $extra + ['customer_id' => $this->customer, 'items' => [['plan_id' => $this->monthly, 'quantity' => 2], ['plan_id' => $this->hourly, 'quantity' => 1.5]]], $this->key())
            ->assertCreated()->json('data');
    }

    public function test_totals_with_igv_and_frozen_prices(): void
    {
        $this->assertSame(1500, OrderTotals::lineAmount('1.000', 1500));
        $this->assertSame(3, OrderTotals::lineAmount('0.125', 20)); // 2,5 → 3 (half-up)
        $this->assertSame(18, OrderTotals::tax(100, '18.0000'));

        $order = $this->order();
        $this->assertMatchesRegularExpression('/^PED-\d{6}$/', $order['number']);
        $this->assertSame('draft', $order['status']);
        $this->assertSame('PEN', $order['currency']);
        $this->assertSame($this->brand, $order['brand_id']);
        // 2 × 19,90 + 1,5 h × 95,00 = 182,30; IGV 18 % = 32,814 → 32,81; total 215,11.
        $this->assertSame(18230, $order['subtotal_minor']);
        $this->assertSame(3281, $order['tax_minor']);
        $this->assertSame(21511, $order['total_minor']);
        $this->assertSame('18.0000', $order['tax_rate_percent']);
        $this->assertSame([3980, 14250], array_column($order['items'], 'amount_minor'));

        // Precio congelado: un precio nuevo del catálogo no cambia el pedido ya creado.
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $this->monthly, 'currency' => 'PEN', 'price_minor' => 2490, 'effective_from' => now()->addDay()->toDateString()])->assertCreated();
        $this->travel(2)->days();
        $this->getJson("/api/v1/admin/orders/{$order['id']}")->assertOk()->assertJsonPath('data.items.0.unit_price_minor', 1990)->assertJsonPath('data.total_minor', 21511);
        $this->assertSame(2490, $this->order(['items' => [['plan_id' => $this->monthly]]])['items'][0]['unit_price_minor']);

        // USD y exportación: la línea de producto exportable a cliente export no lleva IGV.
        $usd = $this->order(['currency' => 'USD', 'items' => [['plan_id' => $this->monthly]]]);
        $this->assertSame([590, 106, 696], [$usd['subtotal_minor'], $usd['tax_minor'], $usd['total_minor']]);
        $this->assertProblem($this->postJson('/api/v1/admin/orders', ['customer_id' => $this->customer, 'currency' => 'USD', 'items' => [['plan_id' => $this->hourly]]], $this->key()), 422, 'validation_failed');
        $export = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Foreign LLC', 'country' => 'US', 'currency' => 'PEN', 'origin_brand_id' => $this->brand, 'tax_treatment' => 'export'])->assertCreated()->json('data.id');
        $exp = $this->order(['customer_id' => $export, 'items' => [['plan_id' => $this->hourly, 'quantity' => 2], ['plan_id' => $this->monthly]]]);
        $this->assertSame([21490, 448, 21938], [$exp['subtotal_minor'], $exp['tax_minor'], $exp['total_minor']]);
        $this->assertSame('export', $exp['items'][0]['config']['tax']['treatment']);
    }

    public function test_draft_can_be_edited_and_totals_are_recalculated(): void
    {
        $order = $this->order();
        $response = $this->patchJson('/api/v1/admin/orders/'.$order['id'], [
            'version' => $order['version'],
            'notes' => 'Ajuste solicitado',
            'items' => [['plan_id' => $this->monthly, 'quantity' => 3]],
        ])->assertOk();

        $response->assertJsonPath('data.status', 'draft')
            ->assertJsonPath('data.notes', 'Ajuste solicitado')
            ->assertJsonPath('data.subtotal_minor', 5970)
            ->assertJsonPath('data.tax_minor', 1075)
            ->assertJsonPath('data.total_minor', 7045)
            ->assertJsonCount(1, 'data.items');
        $this->assertSame(['order.created', 'order.updated'], DB::table('audit_events')->where('entity_type', 'order')->orderBy('chain_seq')->pluck('action')->all());
    }

    public function test_non_draft_order_cannot_be_edited(): void
    {
        $order = $this->order(['items' => [['plan_id' => $this->monthly]]]);
        $this->postJson('/api/v1/admin/orders/'.$order['id'].'/approve', ['version' => $order['version']], $this->key())->assertOk();

        $this->assertProblem($this->patchJson('/api/v1/admin/orders/'.$order['id'], [
            'version' => 2,
            'items' => [['plan_id' => $this->monthly, 'quantity' => 2]],
        ]), 409, 'invalid_transition');
    }

    public function test_totals_preview_matches_created_order(): void
    {
        $body = [
            'customer_id' => $this->customer,
            'items' => [['plan_id' => $this->monthly, 'quantity' => 2], ['plan_id' => $this->hourly, 'quantity' => 1.5]],
        ];
        $preview = $this->postJson('/api/v1/admin/orders/totals-preview', $body)->assertOk()->json('data');
        $order = $this->postJson('/api/v1/admin/orders', $body, $this->key())->assertCreated()->json('data');

        $this->assertSame($order['subtotal_minor'], $preview['subtotal_minor']);
        $this->assertSame($order['tax_minor'], $preview['tax_minor']);
        $this->assertSame($order['total_minor'], $preview['total_minor']);
    }

    public function test_state_machine_idempotency_and_events(): void
    {
        Event::fake([OrderApproved::class, OrderCancelled::class]);
        $this->assertProblem($this->postJson('/api/v1/admin/orders', ['customer_id' => $this->customer, 'items' => [['plan_id' => $this->monthly]]]), 400, 'bad_request');

        $headers = $this->key();
        $body = ['customer_id' => $this->customer, 'items' => [['plan_id' => $this->monthly]]];
        $a = $this->postJson('/api/v1/admin/orders', $body, $headers)->assertCreated()->json('data.id');
        $this->assertSame($a, $this->postJson('/api/v1/admin/orders', $body, $headers)->assertCreated()->json('data.id'));
        $this->assertSame(1, DB::table('orders')->count());

        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$a}/approve", ['version' => 1]), 400, 'bad_request');
        $this->postJson("/api/v1/admin/orders/{$a}/approve", ['version' => 1], $this->key())->assertOk()->assertJsonPath('data.status', 'approved')->assertJsonPath('data.approved_by', $this->admin->id);
        Event::assertDispatched(OrderApproved::class, fn (OrderApproved $e) => $e->id === $a && $e->totalMinor === 2348 && count($e->itemIds) === 1);
        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$a}/approve", [], $this->key()), 409, 'invalid_transition');

        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$a}/cancel", [], $this->key()), 422, 'validation_failed');
        $this->postJson("/api/v1/admin/orders/{$a}/cancel", ['reason' => 'Cliente desistió'], $this->key())->assertOk()->assertJsonPath('data.status', 'cancelled');
        Event::assertDispatched(OrderCancelled::class);
        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$a}/cancel", ['reason' => 'otra vez'], $this->key()), 409, 'invalid_transition');
        $this->assertSame(['order.created', 'order.approved', 'order.cancelled'], DB::table('audit_events')->where('entity_type', 'order')->orderBy('chain_seq')->pluck('action')->all());

        // Un producto con pedidos no se borra.
        $product = DB::table('plans')->where('id', $this->monthly)->value('product_id');
        $this->assertProblem($this->deleteJson("/api/v1/admin/products/{$product}"), 409, 'product_in_use');

        // Listado con filtros y cursor.
        $this->order();
        $this->order();
        $page = $this->getJson('/api/v1/admin/orders?filter[status]=draft&page[size]=1')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.has_more', true);
        $this->getJson('/api/v1/admin/orders?filter[status]=draft&page[size]=1&page[cursor]='.$page->json('meta.next_cursor'))->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('meta.has_more', false);
        $this->getJson('/api/v1/admin/orders?filter[status]=cancelled')->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $a);
        $this->getJson('/api/v1/admin/orders?q=demo')->assertOk()->assertJsonCount(3, 'data');
    }

    public function test_permissions_and_organization_isolation(): void
    {
        $sales = $this->makeUser(['sales'], mfa: true);
        $support = $this->makeUser(['support'], mfa: true);
        $this->actAs($sales);
        $order = $this->order();
        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$order['id']}/approve", [], $this->key()), 403, 'forbidden');
        $this->postJson("/api/v1/admin/orders/{$order['id']}/cancel", ['reason' => 'Error de digitación'], $this->key())->assertOk();

        $this->actAs($support);
        $this->getJson("/api/v1/admin/orders/{$order['id']}")->assertOk();
        $this->assertProblem($this->postJson('/api/v1/admin/orders', ['customer_id' => $this->customer, 'items' => [['plan_id' => $this->monthly]]], $this->key()), 403, 'forbidden');

        // Cliente y plan de otra organización: no existen para esta (422), y un pedido ajeno responde 404.
        $this->actAs($this->admin);
        $other = (string) Str::uuid();
        DB::table('organizations')->insert(['id' => $other, 'name' => 'Otra', 'slug' => 'otra']);
        $otherEntity = (string) Str::uuid();
        DB::table('legal_entities')->insert(['id' => $otherEntity, 'organization_id' => $other, 'legal_name' => 'Otra SAC', 'tax_id' => '20111111111']);
        $otherBrand = (string) Str::uuid();
        DB::table('brands')->insert(['id' => $otherBrand, 'organization_id' => $other, 'code' => 'otra', 'name' => 'Otra', 'default_legal_entity_id' => $otherEntity]);
        $otherCustomer = (string) Str::uuid();
        DB::table('customers')->insert(['id' => $otherCustomer, 'organization_id' => $other, 'code' => 'CLI-1', 'type' => 'company', 'legal_name' => 'Ajeno', 'normalized_name' => 'ajeno', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $otherBrand]);
        $response = $this->postJson('/api/v1/admin/orders', ['customer_id' => $otherCustomer, 'items' => [['plan_id' => $this->monthly]]], $this->key());
        $this->assertProblem($response, 422, 'validation_failed');
        $this->assertArrayHasKey('customer_id', $response->json('errors'));
        $otherOrder = (string) Str::uuid();
        DB::table('orders')->insert(['id' => $otherOrder, 'organization_id' => $other, 'number' => 'PED-1', 'customer_id' => $otherCustomer, 'brand_id' => $otherBrand, 'currency' => 'PEN']);
        $this->assertProblem($this->getJson("/api/v1/admin/orders/{$otherOrder}"), 404, 'not_found');
        $this->assertProblem($this->postJson("/api/v1/admin/orders/{$otherOrder}/approve", [], $this->key()), 404, 'not_found');
        $this->getJson('/api/v1/admin/orders')->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_sales_cannot_delete_customers_and_validation_is_in_spanish(): void
    {
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actAs($sales);
        $this->assertProblem($this->deleteJson("/api/v1/admin/customers/{$this->customer}"), 403, 'forbidden');
        $this->getJson("/api/v1/admin/customers/{$this->customer}")->assertOk();
        $this->patchJson("/api/v1/admin/customers/{$this->customer}", ['version' => 1, 'trade_name' => 'Demo'])->assertOk();

        // El cliente de pruebas de Symfony envía Accept-Language: en-us por defecto; el navegador manda es-PE.
        $response = $this->postJson('/api/v1/admin/customers', ['type' => 'company'], ['Accept-Language' => 'es-PE,es;q=0.9']);
        $this->assertProblem($response, 422, 'validation_failed');
        $this->assertSame('El campo razón social es obligatorio.', $response->json('errors.legal_name.0'));
    }
}
