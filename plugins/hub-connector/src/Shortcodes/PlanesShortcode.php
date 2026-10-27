<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_planes tipo="hosting" ids="" destacados="no" ciclo="anual" moneda="" columnas="3"]
 * (docs/13 §8, wpListPlans). La lista cerrada de tipo es la de
 * GET /public/wp/catalog/categories (shortcode_type o código de categoría).
 */
class PlanesShortcode extends AbstractShortcode
{
    public function tag(): string
    {
        return 'hub_planes';
    }

    protected function defaults(): array
    {
        return ['tipo' => '', 'ids' => '', 'destacados' => 'no', 'ciclo' => 'anual', 'moneda' => '', 'columnas' => '3'];
    }

    protected function render(array $atts): string
    {
        if ($atts['tipo'] === '' || !self::isCode($atts['tipo'])) {
            throw new InvalidAttribute(__('El atributo tipo es obligatorio.', 'hub-connector'));
        }
        $ids = $this->codes('ids', $atts['ids']);
        $featured = $this->oneOf('destacados', $atts['destacados'], ['si', 'no']) === 'si';
        $cycle = $this->cycle($atts['ciclo'], 'anual');
        $columns = (int) $this->oneOf('columnas', $atts['columnas'], ['1', '2', '3', '4']);
        $currencies = $this->currencies($atts['moneda']);

        $categories = $this->plugin->cache()->fetch(Endpoints::CATEGORIES, [], 'catalog');
        if (is_array($categories['data'])) {
            $types = [];
            foreach ($categories['data'] as $category) {
                foreach (['shortcode_type', 'code'] as $field) {
                    if (is_array($category) && is_string($category[$field] ?? null)) {
                        $types[] = strtolower($category[$field]);
                    }
                }
            }
            $this->oneOf('tipo', $atts['tipo'], $types);
        }

        $plans = $this->collect($atts['tipo'], $ids, $featured, $currencies, $result);
        if ($plans === null) {
            return $this->unavailable($result, 'tipo="' . $atts['tipo'] . '"');
        }
        if ($plans === []) {
            return $this->editorNotice(__('No hay planes vendibles para estos atributos.', 'hub-connector'));
        }

        $views = [];
        foreach (self::pickCycle($plans, $cycle) as $plan) {
            $views[] = $this->planView($plan, $plan['_prices']);
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
}
