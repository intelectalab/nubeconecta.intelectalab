<?php

declare(strict_types=1);

namespace App\Modules\Catalog\Console;

use App\Shared\Organization\CurrentOrganization;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Catálogo de demostración (MVP): copia los datos del prototipo del panel
 * (frontend/apps/admin/src/data/catalog.ts y views/pages/comercial/catalogData.ts)
 * a la marca AlojamientoPlus. Idempotente (códigos `demo-*`); se niega en producción.
 * Precios en PEN tal cual del prototipo (y USD donde el prototipo los trae); sin costos.
 */
final class DemoCatalogCommand extends Command
{
    protected $signature = 'hub:demo:catalog {--brand=alojamientoplus : Código de la marca destino}';

    protected $description = 'Carga el catálogo de demostración del prototipo (no se ejecuta en producción)';

    private const FROM = '2026-01-01';

    private const NOTE = 'Dato del prototipo (demostración).';

    /** código => [nombre, kind, shortcode_type] */
    private const CATEGORIES = [
        'hosting' => ['Hosting compartido', 'shared_hosting', 'hosting'],
        'reseller' => ['Reseller', 'reseller_hosting', 'reseller'],
        'vps' => ['VPS', 'vps', 'vps'],
        'dedicado' => ['Servidores dedicados', 'dedicated_server', 'dedicado'],
        'cloud' => ['Cloud', 'cloud', 'cloud'],
        'dominios' => ['Dominios', 'domain', null],
        'ssl' => ['SSL', 'ssl', 'ssl'],
        'correo' => ['Correo corporativo', 'email', 'correo'],
        'web' => ['Páginas web', 'website', 'web'],
        'tienda' => ['Tiendas virtuales', 'online_store', 'tienda'],
        'moodle' => ['Moodle', 'moodle', 'moodle'],
        'licencias' => ['Licencias', 'license', 'licencia'],
        'soporte' => ['Soporte y mantenimiento', 'support', 'soporte'],
        'desarrollo' => ['Desarrollo a medida', 'custom_development', 'desarrollo'],
        'combos' => ['Paquetes combinados', 'custom', null],
        'personalizados' => ['Personalizados', 'custom', null],
    ];

    /** HPLANS de la marca ap: id, cat, nombre, disco GB, transferencia GB (0 = ilimitada), buzones, BD, sitios, WHM, PEN m/a, USD m/a, online, destacado */
    private const HOSTING = [
        ['HP1', 'hosting', 'Emprendedor', 10, 100, 10, 2, 1, 'ap_emprendedor', 19.9, 199, 5.9, 59, true, false],
        ['HP2', 'hosting', 'Pyme', 30, 0, 50, 10, 5, 'ap_pyme', 34.9, 349, 9.9, 99, true, true],
        ['HP3', 'hosting', 'Corporativo', 80, 0, 200, 30, 20, 'ap_corporativo', 69.9, 699, 18.9, 189, true, false],
        ['HP4', 'reseller', 'Reseller Inicial', 100, 0, 0, 0, 25, 'ap_reseller25', 99, 990, 27, 270, false, false],
        ['HP12', 'reseller', 'Reseller Pro', 250, 0, 0, 0, 60, 'ap_reseller60', 189, 1890, 52, 520, true, true],
    ];

    /** VPLANS: id, nombre, vCPU, RAM GB, disco GB, transferencia TB, SO, gestionado, proveedor, plan de origen, PEN mensual/trimestral/semestral/anual, online */
    private const VPS = [
        ['VP1', 'VPS Start', 2, 4, 80, 4, 'Ubuntu 24.04 / AlmaLinux 9', false, 'Contabo', 'Cloud VPS 10', 75, 210, 405, 780, true],
        ['VP2', 'VPS Pro', 6, 12, 200, 32, 'AlmaLinux 9 + cPanel', true, 'Contabo', 'Cloud VPS 20', 180, 510, 990, 1890, true],
        ['VP3', 'VPS Business', 8, 24, 400, 32, 'AlmaLinux 9 + cPanel', true, 'Contabo', 'Cloud VPS 30', 320, 910, 1760, 3360, true],
        ['VP4', 'Droplet Ágil', 2, 4, 80, 4, 'Ubuntu 24.04', false, 'DigitalOcean', 'Basic 4 GB', 150, 430, 840, 1620, true],
        ['VP5', 'Droplet Gestionado', 4, 8, 160, 5, 'Ubuntu 24.04 + panel', true, 'DigitalOcean', 'Basic 8 GB', 260, 750, 1460, 2808, false],
        ['VP6', 'VPS Dedicado Lima', 4, 16, 500, 10, 'Debian 12', true, 'Propio', 'Nodo propio (colocation)', 290, 840, 1640, 3150, false],
    ];

    /** DEDI: id, nombre, núcleos, RAM GB, discos, ubicación, PEN mensual */
    private const DEDICATED = [
        ['DD1', 'Dedicado Ryzen 12', 12, 128, '2 × 1 TB NVMe', 'Lauterbach, Alemania', 1450],
        ['DD2', 'Dedicado Xeon E-2388G', 8, 64, '2 × 960 GB SSD', 'St. Louis, EE.UU.', 980],
        ['DD3', 'Dedicado Lima Edge', 6, 32, '2 × 480 GB SSD', 'Lima, Perú', 1190],
    ];

    /** TLDS: extensión, PEN, USD (registro anual), online */
    private const TLDS = [
        ['.pe', 129, 35, true], ['.com.pe', 119, 32, true], ['.com', 69, 19, true], ['.net', 79, 21, true],
        ['.org', 69, 18, true], ['.cl', 89, 24, false], ['.mx', 149, 42, true], ['.co', 99, 29, true],
    ];

    /** BUNDLES de la marca ap: id, nombre, componentes, precio de lista, precio, online, activo */
    private const BUNDLES = [
        ['BD1', 'Emprende Online', ['Hosting Emprendedor (anual)', 'Dominio .com.pe', 'SSL incluido'], 318, 259, true, true],
        ['BD2', 'Pyme Profesional', ['Hosting Pyme (anual)', 'Dominio .pe', 'Google Workspace × 3 (anual)'], 1450, 1199, true, true],
    ];

    /** GENPROD: categoría, nombre, detalle, precio PEN, ciclo, venta (online|cotizacion), requiere contrato */
    private const GENERAL = [
        ['dedicado', 'Dedicado AMD Ryzen 12', '12 núcleos · 128 GB RAM · 2 × 1 TB NVMe', 1450, 'Mensual', 'cotizacion', true],
        ['dedicado', 'Dedicado Intel Xeon E-2388G', '8 núcleos · 64 GB RAM · 2 × 960 GB SSD', 980, 'Mensual', 'cotizacion', true],
        ['cloud', 'AWS gestionado', 'Administración + consumo facturado aparte', 350, 'Mensual', 'cotizacion', false],
        ['cloud', 'Azure gestionado', 'Administración + consumo', 350, 'Mensual', 'cotizacion', false],
        ['cloud', 'Google Cloud gestionado', 'Administración + consumo', 350, 'Mensual', 'cotizacion', false],
        ['cloud', 'IBM Cloud gestionado', 'Administración + consumo', 420, 'Mensual', 'cotizacion', false],
        ['ssl', 'SSL DV estándar', '1 dominio · validación de dominio', 89, 'Anual', 'online', false],
        ['ssl', 'SSL Wildcard DV', 'Subdominios ilimitados', 290, 'Anual', 'online', false],
        ['ssl', 'SSL OV empresarial', 'Validación de organización', 690, 'Anual', 'cotizacion', false],
        ['correo', 'Correo cPanel 10 buzones', 'cPanel', 149, 'Anual', 'online', false],
        ['correo', 'Google Workspace Business Starter', 'Google Workspace · por usuario', 27, 'Mensual', 'online', false],
        ['correo', 'Google Workspace Business Standard', 'Google Workspace · por usuario', 54, 'Mensual', 'online', false],
        ['correo', 'Microsoft 365 Business Basic', 'Microsoft 365 · por usuario', 23, 'Mensual', 'online', false],
        ['correo', 'Microsoft 365 Business Standard', 'Microsoft 365 · por usuario', 47, 'Mensual', 'online', false],
        ['web', 'Web corporativa 5 secciones', 'WordPress + diseño a medida', 1800, 'Único', 'cotizacion', true],
        ['web', 'Landing page', '1 página + formulario', 650, 'Único', 'online', false],
        ['tienda', 'Tienda WooCommerce básica', 'Hasta 50 productos + pasarela local', 3200, 'Único', 'cotizacion', true],
        ['tienda', 'Tienda completa', '500 productos · pasarela · facturación electrónica', 5400, 'Único', 'cotizacion', true],
        ['moodle', 'Moodle hosting 100 usuarios', 'Plataforma lista + copias diarias', 180, 'Mensual', 'online', false],
        ['moodle', 'Moodle 500 usuarios', 'VPS dedicado para Moodle', 420, 'Mensual', 'cotizacion', false],
        ['moodle', 'Implementación Moodle', 'Instalación, tema y matrícula inicial', 2500, 'Único', 'cotizacion', true],
        ['licencias', 'Licencia cPanel Admin', '5 cuentas', 135, 'Mensual', 'online', false],
        ['licencias', 'Licencia CloudLinux', 'Por servidor', 75, 'Mensual', 'online', false],
        ['licencias', 'Imunify360', 'Seguridad del servidor', 89, 'Mensual', 'online', false],
        ['licencias', 'Windows Server Standard', 'Licencia SPLA por núcleo', 210, 'Mensual', 'cotizacion', false],
        ['soporte', 'Mantenimiento WordPress', 'Actualizaciones + copias + 1 h de cambios', 150, 'Mensual', 'online', false],
        ['soporte', 'Bolsa de 10 horas de soporte', 'Vigencia 3 meses', 900, 'Único', 'online', false],
        ['desarrollo', 'Desarrollo a medida', 'Por hora de desarrollo', 95, 'Por hora', 'cotizacion', true],
        ['desarrollo', 'Integración de facturación electrónica', 'API de comprobantes SUNAT', 2800, 'Único', 'cotizacion', true],
        ['personalizados', 'Migración de correo asistida', 'Hasta 20 buzones', 390, 'Único', 'cotizacion', false],
        ['personalizados', 'Auditoría de seguridad web', 'Informe + recomendaciones', 1200, 'Único', 'cotizacion', true],
    ];

    private string $org;

    private string $brand;

    /** @var array<string, string> */
    private array $categoryIds = [];

    private int $sort = 0;

    private int $products = 0;

    public function handle(CurrentOrganization $organization): int
    {
        if ($this->laravel->environment('production')) {
            $this->error('hub:demo:catalog no se ejecuta en producción.');

            return self::FAILURE;
        }

        $this->org = $organization->id();
        DB::transaction(function (): void {
            $this->brand = $this->resolveBrand((string) $this->option('brand'));
            $this->taxRate();
            foreach (self::CATEGORIES as $code => [$name, $kind, $shortcode]) {
                $this->categoryIds[$code] = $this->category($code, $name, $kind, $shortcode);
            }
            $this->hosting();
            $this->vps();
            $this->dedicated();
            $this->domains();
            $this->bundles();
            $this->general();
        });

        $this->info("Catálogo de demostración cargado en la marca {$this->option('brand')}: {$this->products} productos.");

        return self::SUCCESS;
    }

    private function hosting(): void
    {
        foreach (self::HOSTING as [$id, $cat, $name, $disk, $bw, $mails, $dbs, $sites, $whm, $penM, $penA, $usdM, $usdA, $online, $featured]) {
            $product = $this->product($id, $cat, $name, "{$disk} GB · {$sites} sitio(s)", 'recurring', $online, false, ['whm_package' => $whm]);
            $limits = ['disk_gb' => $disk, 'bandwidth_gb' => $bw === 0 ? null : $bw, 'email_accounts' => $mails, 'databases' => $dbs, 'websites' => $sites];
            $this->plan($product, "{$id}-m", "{$name} mensual", 'monthly', $limits, ['PEN' => $penM, 'USD' => $usdM]);
            $this->plan($product, "{$id}-a", "{$name} anual", 'annual', $limits, ['PEN' => $penA, 'USD' => $usdA]);
            $this->listing($product, $name, "{$disk} GB · {$sites} sitio(s)", $online, $featured);
        }
    }

    private function vps(): void
    {
        foreach (self::VPS as [$id, $name, $cpu, $ram, $disk, $tr, $os, $managed, $src, $srcPlan, $m, $t, $s, $a, $online]) {
            $sub = "{$cpu} vCPU · {$ram} GB RAM · {$disk} GB";
            // Proveedor y plan de origen en `custom`: nunca se publican (RN-CAT-004).
            $product = $this->product($id, 'vps', $name, $sub, 'recurring', $online, false, ['provider' => $src, 'provider_plan' => $srcPlan]);
            $limits = ['vcpu' => $cpu, 'ram_gb' => $ram, 'disk_gb' => $disk, 'transfer_tb' => $tr, 'os' => $os, 'managed' => $managed];
            foreach (['m' => ['monthly', 'mensual', $m], 't' => ['quarterly', 'trimestral', $t], 's' => ['semiannual', 'semestral', $s], 'a' => ['annual', 'anual', $a]] as $suffix => [$cycle, $label, $price]) {
                $this->plan($product, "{$id}-{$suffix}", "{$name} {$label}", $cycle, $limits, ['PEN' => $price]);
            }
            $this->listing($product, $name, $sub, $online, false);
        }
    }

    private function dedicated(): void
    {
        foreach (self::DEDICATED as [$id, $name, $cpu, $ram, $disk, $loc, $pm]) {
            $sub = "{$cpu} núcleos · {$ram} GB RAM · {$disk} · {$loc}";
            $product = $this->product($id, 'dedicado', $name, $sub, 'recurring', false, true);
            $this->plan($product, "{$id}-m", "{$name} mensual", 'monthly', ['cpu_cores' => $cpu, 'ram_gb' => $ram, 'disks' => $disk, 'location' => $loc], ['PEN' => $pm]);
            $this->listing($product, $name, $sub, false, false);
        }
    }

    private function domains(): void
    {
        foreach (self::TLDS as [$tld, $pen, $usd, $online]) {
            $id = 'tld'.str_replace('.', '-', $tld);
            $product = $this->product($id, 'dominios', "Dominio {$tld}", 'Registro anual', 'recurring', $online, false, ['tld' => $tld]);
            $this->plan($product, "{$id}-a", "Dominio {$tld} anual", 'annual', ['tld' => $tld, 'operation' => 'register'], ['PEN' => $pen, 'USD' => $usd]);
            $this->listing($product, "Dominio {$tld}", 'Registro anual', $online, false);
        }
        $this->domainExtensions();
    }

    /**
     * Extensiones y precios por extensión (domain_extensions / domain_tld_prices) que
     * publica GET /public/wp/catalog/domain-prices. Registrador `demo-registrador` y
     * costo 0: datos de demostración, no tarifas reales. Renovación y transferencia
     * al mismo precio que el registro del prototipo.
     */
    private function domainExtensions(): void
    {
        $registrar = $this->upsert('providers', ['code' => 'demo-registrador'], ['name' => 'Registrador (demostración)', 'type' => 'registrar', 'cost_currency' => 'USD', 'notes_internal' => self::NOTE]);
        foreach (self::TLDS as $i => [$tld, $pen, $usd, $online]) {
            $code = ltrim($tld, '.');
            $ext = $this->upsert('domain_extensions', ['tld' => $code], [
                'default_registrar_id' => $registrar, 'sellable_online' => $online, 'allows_transfer_in' => $code !== 'cl',
                'is_featured' => in_array($code, ['pe', 'com.pe', 'com'], true), 'sort_order' => $i * 10, 'is_active' => true,
            ]);
            foreach (['register', 'renew', 'transfer'] as $operation) {
                foreach (['PEN' => $pen, 'USD' => $usd] as $currency => $amount) {
                    $this->upsert('domain_tld_prices', ['tld' => $code, 'provider_id' => $registrar, 'operation' => $operation, 'years' => 1, 'currency' => $currency, 'effective_from' => self::FROM], [
                        'cost_minor' => 0, 'cost_currency' => $currency, 'price_minor' => self::minor($amount), 'domain_extension_id' => $ext,
                    ]);
                }
            }
        }
    }

    private function bundles(): void
    {
        foreach (self::BUNDLES as [$id, $name, $items, $list, $price, $online, $active]) {
            $sub = implode(' + ', $items);
            $product = $this->product($id, 'combos', $name, $sub, 'recurring', $online, false, ['bundle_items' => $items], $active);
            $this->plan($product, "{$id}-a", "{$name} anual", 'annual', ['items' => $items, 'list_price_minor' => self::minor($list)], ['PEN' => $price]);
            $this->listing($product, $name, $sub, $online, false);
        }
    }

    private function general(): void
    {
        $cycles = ['Mensual' => 'monthly', 'Anual' => 'annual', 'Único' => 'one_time', 'Por hora' => 'one_time'];
        foreach (self::GENERAL as $i => [$cat, $name, $sub, $price, $cy, $sale, $contract]) {
            $id = 'pz-'.str_pad((string) ($i + 1), 3, '0', STR_PAD_LEFT);
            $cycle = $cycles[$cy];
            $online = $sale === 'online';
            $product = $this->product($id, $cat, $name, $sub, $cycle === 'one_time' ? 'one_time' : 'recurring', $online, $contract);
            // Sin ciclo `hourly` en el esquema: precio unitario por hora, la cantidad del pedido son las horas.
            $limits = $cy === 'Por hora' ? ['billing_unit' => 'hour'] : [];
            $this->plan($product, "{$id}-{$cycle}", $name, $cycle, $limits, ['PEN' => $price]);
            $this->listing($product, $name, $sub, $online, false);
        }
    }

    /** @param array<string, mixed> $custom */
    private function product(string $id, string $cat, string $name, string $sub, string $billing, bool $online, bool $contract, array $custom = [], bool $active = true): string
    {
        $this->products++;

        return $this->upsert('products', ['code' => 'demo-'.strtolower($id)], [
            'category_id' => $this->categoryIds[$cat], 'brand_id' => $this->brand, 'name' => $name,
            'description' => "{$sub}. ".self::NOTE, 'billing_type' => $billing, 'requires_contract' => $contract,
            'is_active' => $active, 'sellable_online' => $online, 'deleted_at' => null,
            'custom' => json_encode(['demo' => true, 'source' => 'prototipo', 'prototype_id' => strtoupper($id)] + $custom),
        ]);
    }

    /**
     * @param  array<string, mixed>  $limits
     * @param  array<string, float|int>  $prices  moneda => importe en unidades
     */
    private function plan(string $product, string $code, string $name, string $cycle, array $limits, array $prices): void
    {
        $plan = $this->upsert('plans', ['code' => 'demo-'.strtolower($code)], [
            'product_id' => $product, 'name' => $name, 'cycle' => $cycle, 'is_active' => true, 'deleted_at' => null,
            'limits' => json_encode((object) $limits),
        ]);
        foreach ($prices as $currency => $amount) {
            $this->upsert('plan_prices', ['plan_id' => $plan, 'currency' => $currency, 'effective_from' => self::FROM], ['price_minor' => self::minor($amount), 'setup_fee_minor' => 0]);
        }
    }

    private function listing(string $product, string $name, string $tagline, bool $online, bool $featured): void
    {
        $this->upsert('product_listings', ['product_id' => $product, 'brand_id' => $this->brand, 'deleted_at' => null], [
            'display_name' => json_encode(['es' => $name]), 'tagline' => json_encode(['es' => $tagline]),
            'sellable_online' => $online, 'is_featured' => $featured, 'sort_order' => ++$this->sort,
        ]);
    }

    private function category(string $code, string $name, string $kind, ?string $shortcode): string
    {
        $existing = DB::table('product_categories')->where('organization_id', $this->org)
            ->where(function ($q) use ($code, $kind, $shortcode): void {
                $q->where('code', $code);
                if ($kind !== 'custom') {
                    $q->orWhere(fn ($w) => $w->where('kind', $kind)->whereNull('parent_id'));
                }
                if ($shortcode !== null) {
                    $q->orWhere('shortcode_type', $shortcode);
                }
            })
            ->orderByRaw('code = ? desc', [$code])->value('id');
        if ($existing !== null) {
            return (string) $existing;
        }

        return $this->upsert('product_categories', ['code' => $code], ['name' => $name, 'kind' => $kind, 'shortcode_type' => $shortcode, 'sort_order' => array_search($code, array_keys(self::CATEGORIES), true) * 10]);
    }

    private function resolveBrand(string $code): string
    {
        $id = DB::table('brands')->where('organization_id', $this->org)->whereNull('deleted_at')
            ->where(fn ($q) => $q->where('code', $code)->orWhereRaw('lower(name) = ?', ['alojamientoplus']))->value('id');
        if ($id !== null) {
            return (string) $id;
        }
        $entity = DB::table('legal_entities')->where('organization_id', $this->org)->orderBy('created_at')->value('id')
            ?? $this->upsert('legal_entities', ['tax_id' => '20607431117'], ['legal_name' => 'GRUPO DE SOLUCIONES CREATIVAS']);

        return $this->upsert('brands', ['code' => $code], ['name' => 'AlojamientoPlus', 'default_legal_entity_id' => $entity]);
    }

    /** IGV 18 % para los totales de pedidos; lo administrará BIL (`tax_rates`). */
    private function taxRate(): void
    {
        if (! DB::table('tax_rates')->where('organization_id', $this->org)->where('code', 'igv')->exists()) {
            $this->upsert('tax_rates', ['code' => 'igv', 'effective_from' => '2011-03-01'], ['name' => 'IGV', 'country' => 'PE', 'rate_percent' => '18.0000']);
        }
    }

    /**
     * @param  array<string, mixed>  $keys  columnas de búsqueda (además de organization_id)
     * @param  array<string, mixed>  $values
     */
    private function upsert(string $table, array $keys, array $values): string
    {
        $where = ['organization_id' => $this->org] + $keys;
        $query = DB::table($table);
        foreach ($where as $column => $value) {
            $value === null ? $query->whereNull($column) : $query->where($column, $value);
        }
        $id = $query->value('id');
        if ($id !== null) {
            DB::table($table)->where('id', $id)->update($values + ['updated_at' => now()]);

            return (string) $id;
        }
        $id = (string) Str::uuid();
        DB::table($table)->insert(['id' => $id] + $where + $values);

        return $id;
    }

    private static function minor(float|int $amount): int
    {
        return (int) round($amount * 100);
    }
}
