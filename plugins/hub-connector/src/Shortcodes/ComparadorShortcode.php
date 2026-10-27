<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_comparador tipo="hosting" ids="" caracteristicas="" ciclo="anual" moneda=""]
 * (docs/13 §8, wpComparePlans). Tabla con <caption> y <th scope>, desplazable
 * en móvil; precios en todas las monedas de la marca con data-currency.
 */
class ComparadorShortcode extends AbstractShortcode
{
    /** Nombres legibles de las claves de `limits` más comunes; las demás se humanizan. */
    public const LABELS = [
        'disk_gb' => 'Espacio en disco (GB)',
        'bandwidth_gb' => 'Transferencia mensual (GB)',
        'email_accounts' => 'Cuentas de correo',
        'databases' => 'Bases de datos',
        'websites' => 'Sitios web',
        'vcpu' => 'vCPU',
        'cpu_cores' => 'Núcleos de CPU',
        'ram_gb' => 'Memoria RAM (GB)',
        'transfer_tb' => 'Transferencia (TB)',
        'os' => 'Sistema operativo',
        'managed' => 'Administrado',
        'disks' => 'Discos',
        'location' => 'Ubicación',
        'ssl' => 'Certificado SSL',
        'backups' => 'Copias de seguridad',
    ];

    public function tag(): string
    {
        return 'hub_comparador';
    }

    protected function defaults(): array
    {
        return ['tipo' => '', 'ids' => '', 'caracteristicas' => '', 'ciclo' => 'anual', 'moneda' => ''];
    }

    protected function render(array $atts): string
    {
        if ($atts['tipo'] === '' || !self::isCode($atts['tipo'])) {
            throw new InvalidAttribute(__('El atributo tipo es obligatorio.', 'hub-connector'));
        }
        $ids = $this->codes('ids', $atts['ids']);
        $features = $atts['caracteristicas'] === '' ? [] : array_values(array_filter(array_map('trim', explode(',', $atts['caracteristicas'])), 'strlen'));
        foreach ($features as $feature) {
            if (!preg_match('/^[a-z0-9_]{1,60}$/', $feature)) {
                throw new InvalidAttribute(sprintf(__('Valor no válido en el atributo %1$s: "%2$s".', 'hub-connector'), 'caracteristicas', $feature));
            }
        }
        $cycle = $this->cycle($atts['ciclo'], 'anual');
        $currencies = $this->currencies($atts['moneda']);

        $plans = [];
        $keys = [];
        foreach ($currencies as $currency) {
            $query = ['type' => $atts['tipo'], 'ids' => implode(',', $ids), 'features' => implode(',', $features), 'currency' => $currency, 'lang' => $this->plugin->settings()->lang()];
            $tags = static function ($data) use ($atts, $ids): array {
                $tags = array_merge([$atts['tipo']], $ids);
                foreach ((array) ($data['plans'] ?? []) as $plan) {
                    $tags[] = (string) ($plan['id'] ?? '');
                    $tags[] = (string) ($plan['code'] ?? '');
                }

                return array_values(array_filter($tags, 'strlen'));
            };
            $result = $this->plugin->cache()->fetch(Endpoints::COMPARE, $query, 'catalog', $tags);
            if (!is_array($result['data']) || !is_array($result['data']['plans'] ?? null)) {
                return $this->unavailable($result, 'tipo="' . $atts['tipo'] . '"');
            }
            foreach ((array) ($result['data']['features'] ?? []) as $key) {
                if (is_string($key) && preg_match('/^[a-z0-9_]{1,60}$/', $key) && !in_array($key, $keys, true)) {
                    $keys[] = $key;
                }
            }
            foreach ($result['data']['plans'] as $plan) {
                if (!is_array($plan) || !is_string($plan['id'] ?? null)) {
                    continue;
                }
                $plans[$plan['id']] ??= $plan + ['_prices' => []];
                if (is_array($plan['price'] ?? null) && ($plan['price']['currency'] ?? '') === $currency) {
                    $plans[$plan['id']]['_prices'][$currency] = $plan['price'];
                }
            }
        }
        if ($plans === []) {
            return $this->editorNotice(__('No hay planes vendibles para estos atributos.', 'hub-connector'));
        }

        $columns = [];
        foreach (PlanesShortcode::pickCycleFor($plans, $cycle) as $plan) {
            $view = $this->planView($plan, $plan['_prices']);
            $view['values'] = [];
            $limits = (array) ($plan['limits'] ?? []);
            foreach ($keys as $key) {
                // Sin la clave: el plan no lo incluye; clave con null: ilimitado.
                $view['values'][$key] = array_key_exists($key, $limits) ? self::featureValue($limits[$key]) : '—';
            }
            $columns[] = $view;
        }
        $rows = [];
        foreach ($keys as $key) {
            $rows[$key] = self::LABELS[$key] ?? ucfirst(str_replace('_', ' ', $key));
        }

        return $this->plugin->templates()->render('compare', [
            'caption' => sprintf(__('Comparación de planes: %s', 'hub-connector'), $atts['tipo']),
            'plans' => $columns,
            'rows' => $rows,
            'visible_currency' => $this->visibleCurrency($currencies),
        ]);
    }

    /** Valor legible de una característica (sin escapar: escapa la plantilla). */
    public static function featureValue(mixed $value): string
    {
        return match (true) {
            $value === null => __('Ilimitado', 'hub-connector'),
            $value === true => __('Sí', 'hub-connector'),
            $value === false => __('No', 'hub-connector'),
            is_array($value) => implode(', ', array_filter(array_map(static fn ($v) => is_scalar($v) ? (string) $v : '', $value), 'strlen')),
            is_scalar($value) => (string) $value,
            default => '',
        };
    }
}
