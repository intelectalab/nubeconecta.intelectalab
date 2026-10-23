<?php

declare(strict_types=1);

namespace Tests\Feature\Services;

use App\Modules\Orders\Events\OrderApproved;
use App\Modules\Services\Events\ServiceActivated;
use App\Modules\Services\Events\ServiceCreated;
use App\Modules\Services\Services\ServiceLifecycle;
use App\Modules\Services\Support\Cycle;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\Feature\Billing\SalesFlowTestCase;

/** Franja MVP de M-SRV: servicio por línea al aprobar, transiciones con permiso, suscripción y portal sin IDOR. */
final class ServicesTest extends SalesFlowTestCase
{
    /** @return array<string, mixed> */
    private function hostingService(array $order): array
    {
        $item = collect($order['items'])->first(fn ($i) => $i['plan_id'] === $this->monthly && ($i['config']['kind'] ?? null) !== 'setup_fee');

        return $this->getJson('/api/v1/admin/services/'.DB::table('order_items')->where('id', $item['id'])->value('service_id'))->assertOk()->json('data');
    }

    public function test_order_approval_creates_one_pending_service_per_line(): void
    {
        Event::fake([ServiceCreated::class]);
        $order = $this->approvedOrder();

        // 3 líneas (hosting, instalación, horas): la instalación no genera servicio.
        $this->assertSame(2, DB::table('services')->count());
        Event::assertDispatchedTimes(ServiceCreated::class, 2);
        $service = $this->hostingService($order);
        $this->assertSame('pending', $service['status']);
        $this->assertMatchesRegularExpression('/^SRV-\d{6}$/', $service['code']);
        $this->assertSame([$this->rucCustomer, $this->monthly, 'monthly', $order['id']], [$service['customer_id'], $service['plan_id'], $service['cycle'], $service['order_id']]);
        $this->assertSame(['unit_price_minor' => 1990, 'quantity' => '2.000', 'currency' => 'PEN'], $service['price']);
        $this->assertSame(now()->toDateString(), $service['starts_on']);
        $this->assertSame(Cycle::add(now()->toDateString(), 'monthly'), $service['commercial_due_date']);
        $this->assertSame('pending', $service['history'][0]['to_status']);
        $this->assertSame('order', $service['history'][0]['trigger_source']);
        $hours = DB::table('services')->where('plan_id', $this->hourly)->first();
        $this->assertNull($hours->commercial_due_date);
        // Enlace desde la ficha del pedido: filtro por pedido de origen.
        $this->getJson("/api/v1/admin/services?filter[order_id]={$order['id']}")->assertOk()->assertJsonCount(2, 'data');
        $this->getJson('/api/v1/admin/services?filter[order_id]='.\Illuminate\Support\Str::uuid())->assertOk()->assertJsonCount(0, 'data');

        // Precio congelado: un precio nuevo no cambia el servicio. Reprocesar el evento no duplica.
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $this->monthly, 'currency' => 'PEN', 'price_minor' => 2990, 'effective_from' => now()->addDay()->toDateString()])->assertCreated();
        app(ServiceLifecycle::class)->createFromOrder(new OrderApproved(DB::table('organizations')->value('id'), $order['id'], $this->rucCustomer, $this->brand, 'PEN', 0, array_column($order['items'], 'id'), false, null));
        $this->assertSame(2, DB::table('services')->count());
        $this->assertSame(1990, $this->hostingService($order)['price']['unit_price_minor']);
    }

    public function test_manual_transitions_with_subscription_history_and_permissions(): void
    {
        $service = $this->hostingService($this->approvedOrder());
        $id = $service['id'];

        Event::fake([ServiceActivated::class]);
        $active = $this->postJson("/api/v1/admin/services/{$id}/activate", [], $this->key())->assertOk()->json('data');
        Event::assertDispatched(ServiceActivated::class);
        $this->assertSame('active', $active['status']);
        $this->assertNotNull($active['activated_at']);
        $this->assertSame(['status' => 'active', 'cycle' => 'monthly', 'quantity' => '2.000', 'price_minor' => 1990, 'currency' => 'PEN'], array_intersect_key($active['subscription'], array_flip(['status', 'cycle', 'quantity', 'price_minor', 'currency'])));
        $this->assertSame($service['commercial_due_date'], $active['subscription']['next_invoice_date']);
        $this->assertSame('succeeded', DB::table('provisioning_runs')->where('service_id', $id)->value('status'));
        $this->assertNull(DB::table('provisioning_runs')->where('service_id', $id)->value('connector'), 'aprovisionamiento manual');

        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/activate", [], $this->key()), 409, 'invalid_transition');
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/suspend", [], $this->key()), 422, 'validation_failed');
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/suspend", ['reason' => 'Mora', 'version' => 1], $this->key()), 409, 'version_conflict');

        // Ventas ve, pero no suspende ni cancela.
        $sales = $this->makeUser(['sales'], mfa: true);
        $this->actAs($sales);
        $this->getJson("/api/v1/admin/services/{$id}")->assertOk();
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/suspend", ['reason' => 'Mora'], $this->key()), 403, 'forbidden');
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/cancel", ['reason' => 'Baja'], $this->key()), 403, 'forbidden');
        $this->actAs($this->admin);

        $this->postJson("/api/v1/admin/services/{$id}/suspend", ['reason' => 'Mora de prueba'], $this->key())->assertOk()->assertJsonPath('data.status', 'suspended')->assertJsonPath('data.subscription.status', 'paused');
        $this->postJson("/api/v1/admin/services/{$id}/reactivate", ['reason' => 'Pagó'], $this->key())->assertOk()->assertJsonPath('data.status', 'active')->assertJsonPath('data.subscription.status', 'active');
        $cancelled = $this->postJson("/api/v1/admin/services/{$id}/cancel", ['reason' => 'No renueva'], $this->key())->assertOk()->json('data');
        $this->assertSame(['cancelled', 'cancelled'], [$cancelled['status'], $cancelled['subscription']['status']]);
        $this->assertSame(['cancelled', 'active', 'suspended', 'active', 'pending'], array_column($cancelled['history'], 'to_status'));
        $this->assertSame('Mora de prueba', $cancelled['history'][2]['reason']);
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$id}/reactivate", ['reason' => 'x'.'yz'], $this->key()), 409, 'invalid_transition');
        foreach (['service.created', 'service.activated', 'service.suspended', 'service.reactivated', 'service.cancelled'] as $action) {
            $this->assertTrue(DB::table('audit_events')->where('action', $action)->where('entity_id', $id)->exists(), $action);
        }

        // Listado con filtros y cursor.
        $this->getJson('/api/v1/admin/services?filter[status]=cancelled')->assertOk()->assertJsonCount(1, 'data');
        $page = $this->getJson("/api/v1/admin/services?filter[customer_id]={$this->rucCustomer}&page[size]=1")->assertOk();
        $this->assertTrue($page->json('meta.has_more'));
        $this->getJson('/api/v1/admin/services?page[size]=1&page[cursor]='.$page->json('meta.next_cursor'))->assertOk()->assertJsonCount(1, 'data');
    }

    public function test_contract_required_product_stays_pending_and_auto_activation(): void
    {
        DB::table('products')->where('id', $this->hostingProduct)->update(['requires_contract' => true]);
        $service = $this->hostingService($this->approvedOrder());
        $this->assertProblem($this->postJson("/api/v1/admin/services/{$service['id']}/activate", [], $this->key()), 409, 'contract_required');

        DB::table('products')->where('id', $this->hostingProduct)->update(['requires_contract' => false]);
        config(['hub.services.auto_activate' => true]);
        $order = $this->approvedOrder(items: [['plan_id' => $this->monthly]]);
        $this->assertSame('active', $this->hostingService($order)['status']);
    }

    public function test_portal_lists_only_own_services(): void
    {
        $mine = $this->hostingService($this->approvedOrder());
        $other = $this->hostingService($this->approvedOrder($this->dniCustomer, [['plan_id' => $this->monthly]]));
        $user = $this->portalUser($this->rucCustomer, 'portal@cliente-ruc.pe');

        $this->actAs($user);
        $list = $this->getJson('/api/v1/portal/services')->assertOk();
        $this->assertSame([$this->rucCustomer], array_values(array_unique(array_column($list->json('data'), 'customer_id'))));
        $this->assertCount(2, $list->json('data'));
        $detail = $this->getJson("/api/v1/portal/services/{$mine['id']}")->assertOk()->json('data');
        foreach (['notes_internal', 'order_id', 'customer', 'reason', 'trigger_source'] as $hidden) {
            $this->assertStringNotContainsString("\"{$hidden}\"", json_encode($detail));
        }
        $this->assertProblem($this->getJson("/api/v1/portal/services/{$other['id']}"), 404, 'not_found');
        $this->assertProblem($this->getJson('/api/v1/admin/services'), 403, 'forbidden');
        // Un filtro por cliente en el portal no amplía el alcance.
        $this->assertCount(2, $this->getJson("/api/v1/portal/services?filter[customer_id]={$this->dniCustomer}")->assertOk()->json('data'));
    }
}
