<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Http\Controllers;

use App\Modules\Settings\Services\SettingsResolver;
use App\Modules\WebConnector\Models\WpSite;
use App\Modules\WebConnector\Services\Domains\DomainPriceCatalog;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Settings\SettingsReader;
use Carbon\CarbonImmutable;
use Illuminate\Database\Query\Builder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * API de lectura del plugin Hub Connector (/api/v1/public/wp/*, esquema
 * wpSiteToken). Solo datos de la marca del token; nunca costos, proveedor,
 * paquete de WHM, nodo, notas internas ni datos personales (RN-WCN-004).
 * Respuestas con ETag (If-None-Match → 304) y Cache-Control private con
 * web_connector.cache_ttl_seconds.
 */
final class WpPublicController
{
    public function __construct(private readonly SettingsReader $settings, private readonly SettingsResolver $resolver, private readonly DomainPriceCatalog $domainCatalog) {}

    public function site(Request $request): JsonResponse
    {
        $site = $this->wpSite($request);
        $brand = $site->brand;

        return $this->cached($request, [
            'site' => [
                'id' => $site->id,
                'name' => $site->name,
                'base_url' => $site->base_url,
                'network_site_id' => $site->network_site_id,
                'status' => $site->status,
                'thank_you_url' => $site->thank_you_url,
                'invalidate_path' => '/wp-json/hub-connector/v1/invalidate',
            ],
            'brand' => ['code' => $brand->code, 'name' => $brand->name, 'locale' => $brand->locale],
            'currencies' => ['PEN', 'USD'],
            'cache_ttl_seconds' => $this->ttl($request),
            'stale_max_hours' => $this->settings->int('web_connector.stale_max_hours', 72),
            'min_plugin_version' => (string) $this->settings->get('web_connector.min_plugin_version', '1.0.0'),
            'central_urls' => $brand->portal_domain ? ['portal' => 'https://'.$brand->portal_domain] : (object) [],
        ]);
    }

    public function categories(Request $request): JsonResponse
    {
        $this->wpSite($request);
        $rows = DB::table('product_categories as c')
            ->leftJoin('product_categories as p', 'p.id', '=', 'c.parent_id')
            ->where('c.organization_id', $this->org($request))
            ->orderBy('c.sort_order')->orderBy('c.code')
            ->get(['c.code', 'c.name', 'c.kind', 'c.shortcode_type', 'p.code as parent_code', 'c.sort_order']);

        return $this->cached($request, $rows->all());
    }

    public function plans(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'type' => ['sometimes', 'string', 'max:60'],
            'ids' => ['sometimes', 'string', 'max:2000'],
            'featured' => ['sometimes', 'in:true,false,1,0'],
            'cycle' => ['sometimes', 'in:monthly,quarterly,semiannual,annual,biennial,triennial,one_time'],
            'currency' => ['sometimes', 'in:PEN,USD'],
            'lang' => ['sometimes', 'string', 'max:10'],
        ]);
        $query = $this->planQuery($request, $filters);
        if (isset($filters['type'])) {
            $query->where(fn (Builder $q) => $q->where('c.shortcode_type', $filters['type'])->orWhere('c.code', $filters['type']));
        }
        if (isset($filters['ids'])) {
            $ids = array_values(array_filter(array_map('trim', explode(',', $filters['ids']))));
            $query->where(fn (Builder $q) => $q->whereIn('pl.code', $ids)->orWhereIn(DB::raw('pl.id::text'), $ids));
        }
        if (isset($filters['featured'])) {
            $query->where('l.is_featured', in_array($filters['featured'], ['true', '1'], true));
        }
        if (isset($filters['cycle'])) {
            $query->where('pl.cycle', $filters['cycle']);
        }

        return $this->cached($request, $query->get()->map(fn ($row) => $this->presentPlan($row, $filters['lang'] ?? null))->all());
    }

    public function plan(Request $request, string $id): JsonResponse
    {
        $filters = $request->validate(['currency' => ['sometimes', 'in:PEN,USD'], 'lang' => ['sometimes', 'string', 'max:10']]);
        $row = $this->planQuery($request, $filters)->where('pl.id', $id)->first() ?? throw ProblemException::notFound();

        return $this->cached($request, $this->presentPlan($row, $filters['lang'] ?? null));
    }

    /**
     * Catálogo de servidores (VPS/dedicados) de la marca con las especificaciones
     * técnicas públicas de `vps_plan_specs`: vCPU, RAM, disco, tráfico, SO,
     * ubicación. Nunca proveedor de origen, referencia del plan ni costo
     * (RN-WCN-004). Bloque [hub_servidores] / data-hub-block="servidores".
     */
    public function servers(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'tipo' => ['sometimes', 'string', 'max:60'],
            'ids' => ['sometimes', 'string', 'max:2000'],
            'cycle' => ['sometimes', 'in:monthly,quarterly,semiannual,annual,biennial,triennial,one_time'],
            'currency' => ['sometimes', 'in:PEN,USD'],
            'lang' => ['sometimes', 'string', 'max:10'],
        ]);
        $query = $this->planQuery($request, $filters)
            ->join('vps_plan_specs as vs', 'vs.product_id', '=', 'p.id')
            ->addSelect([
                'vs.vcpu', 'vs.ram_mb', 'vs.disk_gb', 'vs.transfer_gb', 'vs.os_options',
                'vs.is_managed', 'vs.location', 'vs.cpu_model', 'vs.disk_type',
            ]);
        if (isset($filters['tipo'])) {
            $tipo = $filters['tipo'] === 'dedicated' ? 'dedicado' : $filters['tipo'];
            $query->where(fn (Builder $q) => $q->where('c.shortcode_type', $tipo)->orWhere('c.code', $tipo));
        }
        if (isset($filters['ids'])) {
            $ids = array_values(array_filter(array_map('trim', explode(',', $filters['ids']))));
            $query->where(fn (Builder $q) => $q->whereIn('pl.code', $ids)->orWhereIn(DB::raw('pl.id::text'), $ids));
        }
        if (isset($filters['cycle'])) {
            $query->where('pl.cycle', $filters['cycle']);
        }

        return $this->cached($request, $query->get()->map(fn ($row) => $this->presentServer($row, $filters['lang'] ?? null))->all());
    }

    /**
     * Paquete (bundle) de la marca por código o id: el plan del paquete con su
     * precio y los planes incluidos con su cantidad (nombre y cantidad, sin
     * precios ni costos de los ítems). Bloque [hub_paquete].
     */
    public function bundle(Request $request, string $id): JsonResponse
    {
        $filters = $request->validate(['currency' => ['sometimes', 'in:PEN,USD'], 'lang' => ['sometimes', 'string', 'max:10']]);
        $lang = $filters['lang'] ?? null;
        $site = $this->wpSite($request);
        $isUuid = preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i', $id) === 1;
        $bundle = $this->planQuery($request, $filters)
            ->where(fn (Builder $q) => $isUuid ? $q->where('pl.id', $id) : $q->where('pl.code', $id))
            ->first() ?? throw ProblemException::notFound();

        $lang2 = strtolower(substr($lang ?? 'es', 0, 2));
        $pick = function (mixed $json, string $fallback) use ($lang2): string {
            $value = json_decode((string) $json, true);
            $text = is_array($value) ? ($value[$lang2] ?? $value['es'] ?? reset($value)) : null;

            return is_string($text) && $text !== '' ? $text : $fallback;
        };
        $items = DB::table('bundle_items as bi')
            ->join('plans as pl', 'pl.id', '=', 'bi.item_plan_id')
            ->join('products as p', 'p.id', '=', 'pl.product_id')
            ->join('product_categories as c', 'c.id', '=', 'p.category_id')
            ->leftJoin('product_listings as l', fn ($j) => $j->on('l.product_id', '=', 'p.id')->where('l.brand_id', $site->brand_id)->whereNull('l.deleted_at'))
            ->where('bi.bundle_plan_id', $bundle->id)
            ->where('bi.organization_id', $site->organization_id)
            ->whereNull('pl.deleted_at')
            ->orderBy('pl.code')
            ->get(['pl.name as plan_name', 'l.display_name', 'c.shortcode_type', 'bi.quantity'])
            ->map(fn ($r) => [
                'name' => $pick($r->display_name, (string) $r->plan_name),
                'type' => $r->shortcode_type,
                'quantity' => (float) $r->quantity,
            ])->all();

        return $this->cached($request, $this->presentPlan($bundle, $lang) + ['items' => $items]);
    }

    /**
     * Portal de estado de la marca (bloque [hub_estado_servicios]): incidencias
     * marcadas como públicas con su resumen público, y un estado general. Nunca
     * causa raíz, notas internas ni monitores crudos (RN-WCN-004).
     */
    public function status(Request $request): JsonResponse
    {
        $site = $this->wpSite($request);
        $incidents = DB::table('incidents')
            ->where('organization_id', $site->organization_id)
            ->where('is_public', true)
            ->orderByRaw("(status = 'resolved')")
            ->orderByDesc('started_at')
            ->limit(20)
            ->get(['title', 'public_summary', 'kind', 'severity', 'status', 'started_at', 'resolved_at']);
        $open = $incidents->where('status', '!=', 'resolved');
        $overall = $open->isEmpty()
            ? 'operational'
            : ($open->contains(fn ($i) => in_array($i->severity, ['critical', 'high'], true)) ? 'major' : 'minor');

        return $this->cached($request, [
            'status' => $overall,
            'incidents' => $incidents->map(fn ($i) => [
                'title' => $i->title,
                'summary' => $i->public_summary,
                'kind' => $i->kind,
                'severity' => $i->severity,
                'state' => $i->status,
                'started_at' => $i->started_at ? CarbonImmutable::parse($i->started_at)->toIso8601String() : null,
                'resolved_at' => $i->resolved_at ? CarbonImmutable::parse($i->resolved_at)->toIso8601String() : null,
            ])->all(),
        ]);
    }

    /**
     * Promociones públicas de la marca: cupones activos y vigentes (dentro de
     * valid_from/valid_until y sin agotar max_uses), globales (brand_id null) o
     * de la marca del sitio. Expone el código para usarlo en el portal/checkout.
     * Bloque [hub_promocion] / data-hub-block="promocion".
     */
    public function promotions(Request $request): JsonResponse
    {
        $site = $this->wpSite($request);
        $today = CarbonImmutable::now()->toDateString();
        $rows = DB::table('coupons as c')
            ->leftJoin('products as p', fn ($j) => $j->on('p.id', '=', 'c.product_id'))
            ->where('c.organization_id', $site->organization_id)
            ->where('c.is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('c.brand_id')->orWhere('c.brand_id', $site->brand_id))
            ->where(fn (Builder $q) => $q->whereNull('c.valid_from')->orWhereDate('c.valid_from', '<=', $today))
            ->where(fn (Builder $q) => $q->whereNull('c.valid_until')->orWhereDate('c.valid_until', '>=', $today))
            ->where(fn (Builder $q) => $q->whereNull('c.max_uses')->orWhereColumn('c.uses_count', '<', 'c.max_uses'))
            ->orderByRaw('c.valid_until is null, c.valid_until')
            ->limit(20)
            ->get(['c.code', 'c.description', 'c.discount_type', 'c.discount_percent', 'c.discount_minor', 'c.currency', 'c.valid_until', 'p.name as product_name']);

        return $this->cached($request, $rows->map(fn ($r) => [
            'code' => $r->code,
            'description' => $r->description,
            'discount_type' => $r->discount_type,
            'discount_percent' => $r->discount_percent !== null ? (float) $r->discount_percent : null,
            'discount_minor' => $r->discount_minor !== null ? (int) $r->discount_minor : null,
            'currency' => $r->currency,
            'product_name' => $r->product_name,
            'valid_until' => $r->valid_until ? CarbonImmutable::parse($r->valid_until)->toDateString() : null,
        ])->all());
    }

    public function contact(Request $request): JsonResponse
    {
        $filters = $request->validate(['field' => ['sometimes', 'in:phone,email,whatsapp,address,hours']]);
        $site = $this->wpSite($request);
        $rows = DB::table('brand_contact_points')
            ->where('organization_id', $site->organization_id)->where('brand_id', $site->brand_id)
            ->where('is_public', true)->whereNull('deleted_at')
            ->when(isset($filters['field']), fn (Builder $q) => $q->where('kind', $filters['field']))
            ->orderBy('kind')->orderByDesc('is_primary')->orderBy('position')
            ->get(['kind', 'label', 'value', 'is_primary', 'position'])
            ->map(fn ($r) => ['kind' => $r->kind, 'label' => json_decode((string) $r->label, true) ?: (object) [], 'value' => $r->value, 'is_primary' => (bool) $r->is_primary, 'position' => (int) $r->position]);

        return $this->cached($request, $rows->all());
    }

    /**
     * Comparador de una categoría o tipo (wpComparePlans): los mismos planes de
     * wpListPlans y las características comparables (claves de `limits`, en el
     * orden en que aparecen, o las pedidas en `features`).
     */
    public function compare(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'type' => ['required', 'string', 'max:60'],
            'ids' => ['sometimes', 'string', 'max:2000'],
            'features' => ['sometimes', 'string', 'max:1000', 'regex:/^[a-z0-9_]+(,[a-z0-9_]+)*$/'],
            'cycle' => ['sometimes', 'in:monthly,quarterly,semiannual,annual,biennial,triennial,one_time'],
            'currency' => ['sometimes', 'in:PEN,USD'],
            'lang' => ['sometimes', 'string', 'max:10'],
        ]);
        $query = $this->planQuery($request, $filters)
            ->where(fn (Builder $q) => $q->where('c.shortcode_type', $filters['type'])->orWhere('c.code', $filters['type']));
        if (isset($filters['ids'])) {
            $ids = array_values(array_filter(array_map('trim', explode(',', $filters['ids']))));
            $query->where(fn (Builder $q) => $q->whereIn('pl.code', $ids)->orWhereIn(DB::raw('pl.id::text'), $ids));
        }
        if (isset($filters['cycle'])) {
            $query->where('pl.cycle', $filters['cycle']);
        }
        $plans = $query->get()->map(fn ($row) => $this->presentPlan($row, $filters['lang'] ?? null))->all();

        $features = isset($filters['features']) ? explode(',', $filters['features']) : [];
        if ($features === []) {
            foreach ($plans as $plan) {
                foreach (array_keys((array) $plan['limits']) as $key) {
                    if (is_string($key) && ! in_array($key, $features, true)) {
                        $features[] = $key;
                    }
                }
            }
        }

        return $this->cached($request, ['type' => $filters['type'], 'features' => array_slice($features, 0, 40), 'plans' => $plans]);
    }

    /**
     * Precios de dominios por extensión (wpListDomainPrices): extensiones activas y
     * vendibles en línea, precio vigente a 1 año del registrador por defecto para
     * registro, renovación y transferencia. Nunca costos ni registrador.
     */
    public function domainPrices(Request $request): JsonResponse
    {
        $filters = $request->validate([
            'tlds' => ['sometimes', 'string', 'max:500', 'regex:/^\.?[a-z0-9-]+(\.[a-z0-9-]+)*(,\.?[a-z0-9-]+(\.[a-z0-9-]+)*)*$/'],
            'currency' => ['sometimes', 'in:PEN,USD'],
        ]);
        $tlds = isset($filters['tlds']) ? array_values(array_unique(array_map(fn ($t) => ltrim(trim($t), '.'), explode(',', $filters['tlds'])))) : null;
        $data = $this->domainCatalog->prices($this->org($request), $filters['currency'] ?? 'PEN', $tlds);

        return $this->cached($request, $data);
    }

    /**
     * Documento legal vigente de la marca (wpGetLegalDocument) por slug o por tipo
     * (`terms`, `privacy`, ...): solo la versión publicada; nunca borradores ni
     * quién la revisó.
     */
    public function legalDocument(Request $request, string $slug): JsonResponse
    {
        $filters = $request->validate(['lang' => ['sometimes', 'string', 'max:10']]);
        $site = $this->wpSite($request);
        $lang = strtolower(substr($filters['lang'] ?? 'es', 0, 2));
        $row = DB::table('legal_documents as d')
            ->join('legal_document_versions as v', fn ($j) => $j->on('v.id', '=', 'd.published_version_id')->where('v.status', 'published'))
            ->where('d.organization_id', $site->organization_id)->where('d.brand_id', $site->brand_id)
            ->whereNull('d.deleted_at')
            ->where(fn (Builder $q) => $q->where('d.slug', $slug)->orWhere(fn (Builder $k) => $k->where('d.kind', str_replace('-', '_', $slug))->whereNull('d.product_category_id')))
            ->whereIn('d.locale', array_values(array_unique([$lang, 'es'])))
            ->orderByRaw('d.locale = ? desc', [$lang])->orderByRaw('d.slug = ? desc', [$slug])
            ->first(['d.slug', 'd.kind', 'd.locale', 'd.title', 'v.version_label', 'v.effective_at', 'v.published_at', 'v.body'])
            ?? throw ProblemException::notFound();

        return $this->cached($request, [
            'slug' => $row->slug,
            'kind' => $row->kind,
            'locale' => $row->locale,
            'title' => $row->title,
            'version_label' => $row->version_label,
            'effective_at' => $row->effective_at ? CarbonImmutable::parse($row->effective_at)->toIso8601String() : null,
            'published_at' => $row->published_at ? CarbonImmutable::parse($row->published_at)->toIso8601String() : null,
            'body' => $row->body,
        ]);
    }

    /** Definición pública de un formulario activo de la marca (wpGetWebForm). */
    public function form(Request $request, string $code): JsonResponse
    {
        $filters = $request->validate(['lang' => ['sometimes', 'string', 'max:10']]);
        $lang = strtolower(substr($filters['lang'] ?? 'es', 0, 2));
        $site = $this->wpSite($request);
        $form = DB::table('web_forms')->where('organization_id', $site->organization_id)->where('brand_id', $site->brand_id)
            ->where('code', $code)->where('status', 'active')->whereNull('deleted_at')->first() ?? throw ProblemException::notFound();
        $pick = function (mixed $json) use ($lang): ?string {
            $value = json_decode((string) $json, true);
            if (! is_array($value) || $value === []) {
                return null;
            }
            $text = $value[$lang] ?? $value['es'] ?? reset($value);

            return is_string($text) ? $text : null;
        };
        $fields = DB::table('web_form_fields')->where('web_form_id', $form->id)->orderBy('position')
            ->get(['key', 'label', 'help_text', 'field_type', 'is_required', 'options', 'validation', 'maps_to'])
            ->map(fn ($f) => [
                'key' => $f->key, 'label' => $pick($f->label), 'help_text' => $pick($f->help_text), 'type' => $f->field_type,
                'required' => (bool) $f->is_required, 'maps_to' => $f->maps_to,
                'options' => array_map(fn ($o) => ['value' => (string) ($o['value'] ?? ''), 'label' => $pick(json_encode($o['label'] ?? []))], json_decode((string) $f->options, true) ?: []),
                'validation' => json_decode((string) $f->validation, true) ?: (object) [],
            ]);

        return $this->cached($request, [
            'code' => $form->code,
            'name' => $form->name,
            'fields' => $fields->all(),
            'consent' => ['required' => (bool) $form->consent_required, 'purpose' => $form->consent_purpose, 'text' => $pick($form->consent_text)],
            // D-24: sin proveedor de captcha todavía; el gancho es Contracts\CaptchaVerifier.
            'captcha' => ['required' => (bool) $form->captcha_required, 'provider' => null],
            'success_message' => $pick($form->success_message),
            'redirect_url' => $form->redirect_url,
        ]);
    }

    /** Planes vendibles de la marca con el precio vigente en la moneda pedida (sin costos). */
    private function planQuery(Request $request, array $filters): Builder
    {
        $site = $this->wpSite($request);
        $currency = $filters['currency'] ?? 'PEN';
        $today = now()->toDateString();
        $price = DB::table('plan_prices')->select('price_minor', 'setup_fee_minor', 'currency')
            ->whereColumn('plan_id', 'pl.id')->where('currency', $currency)
            ->where('effective_from', '<=', $today)
            ->where(fn (Builder $q) => $q->whereNull('effective_to')->orWhere('effective_to', '>', $today))
            ->orderByDesc('effective_from')->limit(1);

        return DB::table('product_listings as l')
            ->join('products as p', 'p.id', '=', 'l.product_id')
            ->join('product_categories as c', 'c.id', '=', 'p.category_id')
            ->join('plans as pl', 'pl.product_id', '=', 'p.id')
            ->joinLateral($price, 'pr')
            ->where('l.organization_id', $site->organization_id)
            ->where('l.brand_id', $site->brand_id)
            ->whereNull('l.deleted_at')->whereNull('p.deleted_at')->whereNull('pl.deleted_at')
            ->where('p.is_active', true)->where('pl.is_active', true)
            ->where(fn (Builder $q) => $q->whereNull('p.brand_id')->orWhere('p.brand_id', $site->brand_id))
            ->where(fn (Builder $q) => $q->whereNull('l.visible_from')->orWhere('l.visible_from', '<=', $today))
            ->where(fn (Builder $q) => $q->whereNull('l.visible_until')->orWhere('l.visible_until', '>', $today))
            ->orderBy('l.sort_order')->orderBy('pl.code')
            ->select([
                'pl.id', 'pl.code', 'pl.name as plan_name', 'pl.cycle', 'pl.limits',
                'p.code as product_code', 'p.billing_type', 'p.sellable_online as product_online',
                'c.code as category_code', 'c.shortcode_type',
                'l.display_name', 'l.tagline', 'l.highlights', 'l.is_featured', 'l.sellable_online as listing_online', 'l.sort_order',
                'pr.currency', 'pr.price_minor', 'pr.setup_fee_minor',
            ]);
    }

    /** @return array<string, mixed> */
    private function presentPlan(object $row, ?string $lang): array
    {
        $names = json_decode((string) $row->display_name, true) ?: [];
        $tagline = json_decode((string) $row->tagline, true) ?: [];

        return [
            'id' => $row->id,
            'code' => $row->code,
            'name' => $names[$lang ?? 'es'] ?? $names['es'] ?? (reset($names) ?: $row->plan_name),
            'tagline' => is_array($tagline) ? ($tagline[$lang ?? 'es'] ?? $tagline['es'] ?? null) : null,
            'highlights' => json_decode((string) $row->highlights, true) ?: [],
            'product_code' => $row->product_code,
            'category' => $row->category_code,
            'type' => $row->shortcode_type,
            'billing_type' => $row->billing_type,
            'cycle' => $row->cycle,
            'limits' => json_decode((string) $row->limits, true) ?: (object) [],
            'featured' => (bool) $row->is_featured,
            'sellable_online' => (bool) $row->listing_online && (bool) $row->product_online,
            'price' => ['currency' => trim((string) $row->currency), 'amount_minor' => (int) $row->price_minor, 'setup_fee_minor' => (int) $row->setup_fee_minor],
        ];
    }

    /** presentPlan + especificaciones técnicas públicas del servidor. */
    private function presentServer(object $row, ?string $lang): array
    {
        return $this->presentPlan($row, $lang) + ['specs' => [
            'vcpu' => (int) $row->vcpu,
            'ram_mb' => (int) $row->ram_mb,
            'disk_gb' => (int) $row->disk_gb,
            'transfer_gb' => $row->transfer_gb !== null ? (int) $row->transfer_gb : null,
            'os_options' => $this->pgArray($row->os_options),
            'is_managed' => (bool) $row->is_managed,
            'location' => $row->location,
            'cpu_model' => $row->cpu_model,
            'disk_type' => $row->disk_type,
        ]];
    }

    /** Convierte un `text[]` de PostgreSQL ("{a,b}") en un array PHP. */
    private function pgArray(mixed $value): array
    {
        if (is_array($value)) {
            return array_values($value);
        }
        $s = trim((string) $value);
        if ($s === '' || $s === '{}') {
            return [];
        }

        return array_values(array_filter(
            array_map(fn ($x) => trim($x, " \"'"), str_getcsv(trim($s, '{}'))),
            fn ($x) => $x !== ''
        ));
    }

    private function cached(Request $request, mixed $data): JsonResponse
    {
        $response = response()->json(['data' => $data]);
        $response->setEtag(sha1((string) $response->getContent()));
        $response->headers->set('Cache-Control', 'private, max-age='.$this->ttl($request));
        $response->headers->set('Vary', 'Authorization');
        $response->isNotModified($request); // 304 sin cuerpo si coincide If-None-Match

        return $response;
    }

    /** web_connector.cache_ttl_seconds es por marca (M-WCN §11). */
    private function ttl(Request $request): int
    {
        if ($request->attributes->get('wp_site_token_scope') === 'embed') {
            return max(0, (int) ($this->resolver->get('web_connector.embed.cache_seconds', ['brand' => $this->wpSite($request)->brand_id]) ?? 60));
        }

        return max(0, (int) ($this->resolver->get('web_connector.cache_ttl_seconds', ['brand' => $this->wpSite($request)->brand_id]) ?? 600));
    }

    private function wpSite(Request $request): WpSite
    {
        return $request->attributes->get('wp_site');
    }

    private function org(Request $request): string
    {
        return $this->wpSite($request)->organization_id;
    }
}
