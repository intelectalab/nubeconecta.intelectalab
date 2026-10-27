<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;
use HubConnector\Plugin;

/**
 * [hub_precios_dominios extensiones=".pe,.com.pe,.com" moneda="" titulo=""] (wpListDomainPrices).
 * También responde como [hub_dominios] (nombre de docs/13 §8). Tabla de registro,
 * renovación y transferencia por extensión, en todas las monedas de la marca.
 */
class PreciosDominiosShortcode extends AbstractShortcode
{
    public function __construct(Plugin $plugin, private string $tag = 'hub_precios_dominios')
    {
        parent::__construct($plugin);
    }

    public function tag(): string
    {
        return $this->tag;
    }

    protected function defaults(): array
    {
        return ['extensiones' => '', 'moneda' => '', 'titulo' => ''];
    }

    protected function render(array $atts): string
    {
        $tlds = [];
        foreach ($atts['extensiones'] === '' ? [] : explode(',', $atts['extensiones']) as $item) {
            $tld = ltrim(trim($item), '.');
            if ($tld === '') {
                continue;
            }
            if (!preg_match('/^[a-z0-9-]{1,30}(\.[a-z0-9-]{1,30}){0,2}$/', $tld)) {
                throw new InvalidAttribute(sprintf(__('Valor no válido en el atributo %1$s: "%2$s".', 'hub-connector'), 'extensiones', $item));
            }
            $tlds[] = $tld;
        }
        $currencies = $this->currencies($atts['moneda']);

        $rows = [];
        foreach ($currencies as $currency) {
            $tags = static fn ($data) => array_values(array_filter(array_map(static fn ($r) => is_array($r) ? (string) ($r['tld'] ?? '') : '', is_array($data) ? $data : []), 'strlen'));
            $result = $this->plugin->cache()->fetch(Endpoints::DOMAIN_PRICES, ['tlds' => implode(',', $tlds), 'currency' => $currency], 'domain_prices', $tags);
            if (!is_array($result['data'])) {
                return $this->unavailable($result, 'precios de dominios');
            }
            foreach ($result['data'] as $row) {
                if (!is_array($row) || !is_string($row['tld'] ?? null)) {
                    continue;
                }
                $rows[$row['tld']] ??= ['tld' => $row['tld'], 'name' => '.' . $row['tld'], 'featured' => !empty($row['featured']), 'prices' => []];
                $rows[$row['tld']]['prices'][$currency] = [
                    'register' => self::money($currency, $row['register_minor'] ?? null),
                    'renew' => self::money($currency, $row['renew_minor'] ?? null),
                    'transfer' => self::money($currency, $row['transfer_minor'] ?? null),
                ];
            }
        }
        if ($rows === []) {
            return $this->editorNotice(__('No hay extensiones de dominio vendibles para estos atributos.', 'hub-connector'));
        }

        return $this->plugin->templates()->render('domain-prices', [
            'caption' => $atts['titulo'] !== '' ? ucfirst(sanitize_text_field($atts['titulo'])) : __('Precios de dominios por año', 'hub-connector'),
            'rows' => array_values($rows),
            'currencies' => $currencies,
            'visible_currency' => $this->visibleCurrency($currencies),
        ]);
    }

    /** @return array{amount:string, symbol:string, currency_text:string}|null */
    private static function money(string $currency, mixed $minor): ?array
    {
        if (!is_numeric($minor)) {
            return null;
        }
        $price = self::price($currency, (int) $minor, 0);

        return ['amount' => $price['amount'], 'symbol' => $price['symbol'], 'currency_text' => $price['currency_text']];
    }
}
