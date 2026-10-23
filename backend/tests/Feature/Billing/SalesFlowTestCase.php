<?php

declare(strict_types=1);

namespace Tests\Feature\Billing;

use App\Models\User;
use App\Modules\Customers\Models\Contact;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use Tests\Feature\Identity\IdentityTestCase;

/**
 * Base del flujo de venta Cliente → Catálogo → Pedido → Servicio → Factura:
 * IGV 18 %, entidad emisora con series F001/B001, marca, clientes con RUC y
 * DNI, hosting mensual (19,90) e instalación (10,00), y un plan por hora.
 */
abstract class SalesFlowTestCase extends IdentityTestCase
{
    protected string $seeder = DatabaseSeeder::class;

    protected User $admin;

    protected string $entity;

    protected string $brand;

    protected string $rucCustomer;

    protected string $dniCustomer;

    protected string $monthly;

    protected string $hourly;

    protected string $hostingProduct;

    private int $key = 0;

    protected function setUp(): void
    {
        parent::setUp();
        $this->admin = $this->makeUser(['admin'], mfa: true);
        $this->actAs($this->admin);
        $org = DB::table('organizations')->value('id');
        DB::table('tax_rates')->insert(['organization_id' => $org, 'code' => 'igv', 'name' => 'IGV', 'rate_percent' => '18.0000', 'effective_from' => '2011-03-01']);
        $this->entity = $this->postJson('/api/v1/admin/legal-entities', ['legal_name' => 'Emisora de Prueba SAC', 'tax_id' => '20000000001', 'fiscal_address' => 'Av. Prueba 123, Lima'])->assertCreated()->json('data.id');
        $this->brand = $this->postJson('/api/v1/admin/brands', ['code' => 'marca-a', 'name' => 'Marca A', 'portal_domain' => 'portal.marca-a.test', 'default_legal_entity_id' => $this->entity])->assertCreated()->json('data.id');
        foreach ([['invoice', 'F001'], ['receipt', 'B001']] as [$type, $series]) {
            $this->postJson('/api/v1/admin/document-series', ['legal_entity_id' => $this->entity, 'document_type' => $type, 'series' => $series])->assertCreated();
        }
        $this->rucCustomer = $this->postJson('/api/v1/admin/customers', ['type' => 'company', 'legal_name' => 'Cliente RUC SAC', 'tax_id_type' => 'ruc', 'tax_id' => self::ruc(7), 'address' => 'Jr. Cliente 45', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');
        $this->dniCustomer = $this->postJson('/api/v1/admin/customers', ['type' => 'individual', 'legal_name' => 'Ana Pérez', 'tax_id_type' => 'dni', 'tax_id' => '45678912', 'country' => 'PE', 'currency' => 'PEN', 'origin_brand_id' => $this->brand])->assertCreated()->json('data.id');

        $category = $this->postJson('/api/v1/admin/product-categories', ['code' => 'hosting', 'name' => 'Hosting', 'kind' => 'shared_hosting'])->assertCreated()->json('data.id');
        $this->hostingProduct = $this->postJson('/api/v1/admin/products', ['code' => 'HOST', 'category_id' => $category, 'brand_id' => $this->brand, 'name' => 'Hosting Emprendedor', 'billing_type' => 'recurring'])->assertCreated()->json('data.id');
        $this->monthly = $this->postJson('/api/v1/admin/plans', ['product_id' => $this->hostingProduct, 'code' => 'host-m', 'name' => 'Mensual', 'cycle' => 'monthly'])->assertCreated()->json('data.id');
        $dev = $this->postJson('/api/v1/admin/products', ['code' => 'DEV', 'category_id' => $category, 'name' => 'Desarrollo', 'billing_type' => 'one_time'])->assertCreated()->json('data.id');
        $this->hourly = $this->postJson('/api/v1/admin/plans', ['product_id' => $dev, 'code' => 'dev-h', 'name' => 'Hora', 'cycle' => 'one_time'])->assertCreated()->json('data.id');
        $from = now()->subDay()->toDateString();
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $this->monthly, 'currency' => 'PEN', 'price_minor' => 1990, 'setup_fee_minor' => 1000, 'effective_from' => $from])->assertCreated();
        $this->postJson('/api/v1/admin/plan-prices', ['plan_id' => $this->hourly, 'currency' => 'PEN', 'price_minor' => 9500, 'effective_from' => $from])->assertCreated();
    }

    protected function actAs(User $user): void
    {
        $this->flushSession();
        $this->app['auth']->forgetGuards();
        $this->actingAs($user);
    }

    /** @return array<string, string> */
    protected function key(): array
    {
        return ['Idempotency-Key' => 'flow-'.(++$this->key).'-'.Str::random(8)];
    }

    /**
     * Pedido creado y aprobado. Por defecto: 2 × hosting mensual (+ instalación) y 1,5 h de desarrollo.
     *
     * @param  list<array<string, mixed>>|null  $items
     * @return array<string, mixed>
     */
    protected function approvedOrder(?string $customer = null, ?array $items = null): array
    {
        $order = $this->postJson('/api/v1/admin/orders', ['customer_id' => $customer ?? $this->rucCustomer, 'items' => $items ?? [['plan_id' => $this->monthly, 'quantity' => 2], ['plan_id' => $this->hourly, 'quantity' => 1.5]]], $this->key())
            ->assertCreated()->json('data');

        return $this->postJson("/api/v1/admin/orders/{$order['id']}/approve", [], $this->key())->assertOk()->json('data');
    }

    /** Usuario del portal (customer_admin) enlazado a un contacto del cliente. */
    protected function portalUser(string $customerId, string $email): User
    {
        $contact = $this->postJson("/api/v1/admin/customers/{$customerId}/contacts", ['name' => 'Portal', 'email' => $email, 'roles' => ['administrative'], 'portal_role' => 'customer_admin'])->assertCreated()->json('data.id');

        return User::query()->findOrFail(Contact::query()->findOrFail($contact)->user_id);
    }

    protected static function ruc(int $n): string
    {
        $base = '20'.str_pad((string) $n, 8, '0', STR_PAD_LEFT);
        $sum = 0;
        foreach ([5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as $i => $w) {
            $sum += ((int) $base[$i]) * $w;
        }
        $check = 11 - ($sum % 11);

        return $base.($check === 10 ? 0 : ($check === 11 ? 1 : $check));
    }
}
