<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_planes tipo="hosting" ids="" destacados="no" ciclo="anual" moneda="" columnas="3"]
 * (docs/13 §8, wpListPlans).
 * [hub_planes vista="hero" tipos="hosting,vps,correo" etiquetas="Hosting,VPS,Correo"] pinta una tarjeta con pestañas, una por
 * tipo, con el plan de entrada real (el de menor precio anual): «desde» anual / 12 al mes.
 * La lista cerrada de tipo es la de
 * GET /public/wp/catalog/categories (shortcode_type o código de categoría).
 */
class PlanesShortcode extends AbstractShortcode
{
    /** etiquetas tal como se escribieron (handle() pasa los atributos a minúsculas). */
    private string $rawLabels = '';

    /** @param mixed $atts */
    public function handle($atts = []): string
    {
        $this->rawLabels = is_array($atts) && is_string($atts['etiquetas'] ?? null) ? $atts['etiquetas'] : '';

        return parent::handle($atts);
    }

    public function tag(): string
    {
        return 'hub_planes';
    }

    protected function defaults(): array
    {
        return ['tipo' => '', 'ids' => '', 'destacados' => 'no', 'ciclo' => 'anual', 'moneda' => '', 'columnas' => '3', 'vista' => 'lista', 'tipos' => '', 'etiquetas' => ''];
    }

    protected function render(array $atts): string
    {
        if ($this->oneOf('vista', $atts['vista'], ['lista', 'hero']) === 'hero') {
            return $this->renderHero($atts);
        }
        if ($atts['tipo'] === '' || !self::isCode($atts['tipo'])) {
            throw new InvalidAttribute(__('El atributo tipo es obligatorio.', 'hub-connector'));
        }
        $ids = $this->codes('ids', $atts['ids']);
        $featured = $this->oneOf('destacados', $atts['destacados'], ['si', 'no']) === 'si';
        $cycle = $this->cycle($atts['ciclo'], 'anual');
        $columns = (int) $this->oneOf('columnas', $atts['columnas'], ['1', '2', '3', '4']);
        $currencies = $this->currencies($atts['moneda']);

        $this->checkTypes([$atts['tipo']], 'tipo');

        $plans = $this->collect($atts['tipo'], $ids, $featured, $currencies, $result);
        if ($plans === null) {
            return $this->unavailable($result, 'tipo="' . $atts['tipo'] . '"');
        }
        if ($plans === []) {
            return $this->editorNotice(__('No hay planes vendibles para estos atributos.', 'hub-connector'));
        }

        $views = [];
        foreach (self::pickCycle($plans, $cycle) as $plan) {
            $views[] = $this->quoteFallback($this->planView($plan, $plan['_prices']));
        }

        return $this->plugin->templates()->render('plans', [
            'plans' => $views,
            'columns' => $columns,
            'currencies' => $currencies,
            'visible_currency' => $this->visibleCurrency($currencies),
        ]);
    }

    /**
     * Pide los planes en cada moneda y junta los precios por plan.
     *
     * @return array<string, array<string, mixed>>|null null si no hay datos
     */
    protected function collect(string $type, array $ids, bool $featured, array $currencies, ?array &$result): ?array
    {
        $plans = [];
        $result = ['status' => 'missing', 'data' => null];
        foreach ($currencies as $currency) {
            $query = [
                'type' => $type,
                'ids' => implode(',', $ids),
                'featured' => $featured ? 'true' : null,
                'currency' => $currency,
                'lang' => $this->plugin->settings()->lang(),
            ];
            $tags = static function ($data) use ($type, $ids): array {
                $tags = array_merge([$type], $ids);
                foreach (is_array($data) ? $data : [] as $plan) {
                    $tags[] = (string) ($plan['id'] ?? '');
                    $tags[] = (string) ($plan['code'] ?? '');
                }

                return array_values(array_filter($tags, 'strlen'));
            };
            $result = $this->plugin->cache()->fetch(Endpoints::PLANS, $query, 'catalog', $tags);
            if (!is_array($result['data'])) {
                return null;
            }
            foreach ($result['data'] as $plan) {
                if (!is_array($plan) || !is_string($plan['id'] ?? null)) {
                    continue;
                }
                $plans[$plan['id']] ??= $plan + ['_prices' => []];
                if (is_array($plan['price'] ?? null) && ($plan['price']['currency'] ?? '') === $currency) {
                    $plans[$plan['id']]['_prices'][$currency] = $plan['price'];
                }
            }
        }

        return $plans;
    }

    /**
     * Un plan por producto: el del ciclo pedido o, si no existe, el más corto disponible.
     *
     * @param array<string, array<string, mixed>> $plans
     * @return list<array<string, mixed>>
     */
    public static function pickCycleFor(array $plans, string $cycle): array
    {
        return self::pickCycle($plans, $cycle);
    }

    protected static function pickCycle(array $plans, string $cycle): array
    {
        $byProduct = [];
        foreach ($plans as $plan) {
            $byProduct[(string) ($plan['product_code'] ?? $plan['id'])][] = $plan;
        }
        $picked = [];
        foreach ($byProduct as $group) {
            usort($group, static fn ($a, $b) => array_search($a['cycle'] ?? '', self::CYCLE_ORDER, true) <=> array_search($b['cycle'] ?? '', self::CYCLE_ORDER, true));
            $match = array_values(array_filter($group, static fn ($p) => ($p['cycle'] ?? '') === $cycle));
            $picked[] = $match[0] ?? $group[0];
        }

        return $picked;
    }

    /**
     * Valida los tipos contra GET /catalog/categories y devuelve el nombre visible de cada uno.
     *
     * @param list<string> $types
     * @return array<string, string> tipo → nombre de la categoría
     */
    protected function checkTypes(array $types, string $attribute): array
    {
        $names = [];
        $categories = $this->plugin->cache()->fetch(Endpoints::CATEGORIES, [], 'catalog');
        if (!is_array($categories['data'])) {
            return $names;
        }
        $allowed = [];
        foreach ($categories['data'] as $category) {
            foreach (['shortcode_type', 'code'] as $field) {
                if (is_array($category) && is_string($category[$field] ?? null)) {
                    $allowed[] = strtolower($category[$field]);
                    if (is_string($category['name'] ?? null) && $category['name'] !== '') {
                        $names[strtolower($category[$field])] = $category['name'];
                    }
                }
            }
        }
        foreach ($types as $type) {
            $this->oneOf($attribute, $type, $allowed);
        }

        return $names;
    }

    /** [hub_planes vista="hero" tipos="hosting,vps,correo"]: plan de entrada por tipo, en pestañas. */
    protected function renderHero(array $atts): string
    {
        $types = $this->codes('tipos', $atts['tipos']);
        if ($types === [] || count($types) > 5) {
            throw new InvalidAttribute(__('El atributo tipos es obligatorio (de 1 a 5 tipos).', 'hub-connector'));
        }
        $currencies = $this->currencies($atts['moneda']);
        $names = $this->checkTypes($types, 'tipos');
        // etiquetas="Hosting,VPS,Correo": nombres cortos de las pestañas, en el orden de tipos.
        $labels = $this->rawLabels === '' ? [] : array_map(static fn ($l) => sanitize_text_field($l), explode(',', $this->rawLabels));

        $tabs = [];
        $result = ['status' => 'missing', 'data' => null];
        foreach ($types as $n => $type) {
            $plans = $this->collect($type, [], false, $currencies, $result);
            $entry = $plans ? self::entryPlan($plans, $currencies[0]) : null;
            if ($entry === null) {
                continue;
            }
            $view = $this->quoteFallback($this->planView($entry, $entry['_prices']));
            if ($view['action'] !== null) {
                $label = __('Elegir plan', 'hub-connector');
                $view['action']['text'] = $label;
                $view['action']['aria'] = $label . ' ' . $view['name'];
            }
            $annual = ($entry['cycle'] ?? '') === 'annual';
            $view['monthly'] = [];
            foreach ($entry['_prices'] as $currency => $price) {
                $view['monthly'][$currency] = $annual
                    ? self::price($currency, (int) round(((int) ($price['amount_minor'] ?? 0)) / 12), 0)
                    : $view['prices'][$currency];
            }
            $view['yearly'] = $annual;
            $view['features'] = self::heroFeatures($entry, $view);
            $tabs[] = ['type' => $type, 'label' => ($labels[$n] ?? '') !== '' ? $labels[$n] : ($names[$type] ?? ucfirst($type)), 'plan' => $view];
        }
        if ($tabs === []) {
            return $result['data'] === null
                ? $this->unavailable($result, 'tipos="' . $atts['tipos'] . '"')
                : $this->editorNotice(__('No hay planes vendibles para estos atributos.', 'hub-connector'));
        }

        return $this->plugin->templates()->render('plans-hero', [
            'id' => 'hubhp-' . substr(md5(implode(',', $types)), 0, 6),
            'tabs' => $tabs,
            'visible_currency' => $this->visibleCurrency($currencies),
        ]);
    }

    /**
     * Plan de entrada de un tipo: el de menor precio anual en la moneda principal; si el tipo
     * no tiene ciclo anual, el de menor precio mensual.
     *
     * @param array<string, array<string, mixed>> $plans
     */
    public static function entryPlan(array $plans, string $currency): ?array
    {
        foreach (['annual', 'monthly'] as $cycle) {
            $best = null;
            foreach ($plans as $plan) {
                $amount = $plan['_prices'][$currency]['amount_minor'] ?? null;
                if (($plan['cycle'] ?? '') !== $cycle || !is_numeric($amount)) {
                    continue;
                }
                if ($best === null || (int) $amount < (int) $best['_prices'][$currency]['amount_minor']) {
                    $best = $plan;
                }
            }
            if ($best !== null) {
                return $best;
            }
        }

        return null;
    }

    /**
     * Hasta 4 características reales: los límites del plan en lenguaje llano y, si no
     * llegan a 3, las del lema («10 GB · 1 sitio(s)») y los destacados.
     *
     * @return list<string>
     */
    public static function heroFeatures(array $plan, array $view): array
    {
        $limits = is_array($plan['limits'] ?? null) ? $plan['limits'] : [];
        $count = static fn (int $n, string $one, string $many): string => sprintf($n === 1 ? $one : $many, $n);
        $out = [];
        foreach (['vcpu', 'ram_gb', 'disk_gb', 'websites', 'email_accounts', 'databases', 'bandwidth_gb', 'transfer_tb', 'os'] as $key) {
            if (!array_key_exists($key, $limits)) {
                continue;
            }
            $v = $limits[$key];
            $text = match (true) {
                $key === 'os' => is_string($v) ? $v : '',
                $v === null && $key === 'websites' => __('Sitios web ilimitados', 'hub-connector'),
                $v === null && $key === 'email_accounts' => __('Cuentas de correo ilimitadas', 'hub-connector'),
                $v === null && $key === 'databases' => __('Bases de datos ilimitadas', 'hub-connector'),
                $v === null && in_array($key, ['bandwidth_gb', 'transfer_tb'], true) => __('Transferencia ilimitada', 'hub-connector'),
                !is_numeric($v) => '',
                $key === 'vcpu' => sprintf(__('%s vCPU', 'hub-connector'), $v + 0),
                $key === 'ram_gb' => sprintf(__('%s GB de RAM', 'hub-connector'), $v + 0),
                $key === 'disk_gb' => sprintf(__('%s GB de disco', 'hub-connector'), $v + 0),
                $key === 'websites' => $count((int) $v, __('%d sitio web', 'hub-connector'), __('%d sitios web', 'hub-connector')),
                $key === 'email_accounts' => $count((int) $v, __('%d cuenta de correo', 'hub-connector'), __('%d cuentas de correo', 'hub-connector')),
                $key === 'databases' => $count((int) $v, __('%d base de datos', 'hub-connector'), __('%d bases de datos', 'hub-connector')),
                $key === 'bandwidth_gb' => sprintf(__('%s GB de transferencia al mes', 'hub-connector'), $v + 0),
                $key === 'transfer_tb' => sprintf(__('%s TB de transferencia al mes', 'hub-connector'), $v + 0),
                default => '',
            };
            if ($text !== '') {
                $out[] = $text;
            }
        }
        if (count($out) < 3) {
            foreach (array_merge($view['specs'], $view['highlights']) as $text) {
                if (!in_array($text, $out, true)) {
                    $out[] = $text;
                }
            }
        }

        return array_slice($out, 0, 4);
    }
}
