<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;
use HubConnector\Plugin;

/**
 * Base de los shortcodes (docs/13 §3 y §8): (1) normaliza y valida atributos
 * contra listas cerradas, (2) pide los datos por el CacheStore, (3) renderiza
 * una plantilla. Un sitio sin conectar o un atributo inválido no muestran nada
 * al visitante y avisan solo a quien puede editar (edit_posts).
 */
abstract class AbstractShortcode
{
    public const CYCLES = [
        'mensual' => 'monthly',
        'trimestral' => 'quarterly',
        'semestral' => 'semiannual',
        'anual' => 'annual',
        'bienal' => 'biennial',
        'trienal' => 'triennial',
    ];
    public const CYCLE_ORDER = ['monthly', 'quarterly', 'semiannual', 'annual', 'biennial', 'triennial', 'one_time'];
    public const CURRENCIES = ['PEN', 'USD'];

    public function __construct(protected Plugin $plugin)
    {
    }

    abstract public function tag(): string;

    /** @return array<string, string> */
    abstract protected function defaults(): array;

    /** @param array<string, string> $atts */
    abstract protected function render(array $atts): string;

    /** @param mixed $atts */
    public function handle($atts = []): string
    {
        $atts = shortcode_atts($this->defaults(), is_array($atts) ? $atts : [], $this->tag());
        $atts = array_map(static fn ($v) => trim(strtolower((string) $v)), $atts);
        if (!$this->plugin->settings()->isConnected()) {
            return $this->editorNotice(__('Este sitio no está conectado. Configúralo en Ajustes > Hub Connector.', 'hub-connector'));
        }
        try {
            $html = $this->render($atts);
        } catch (InvalidAttribute $e) {
            return $this->editorNotice($e->getMessage());
        }
        if ($html !== '') {
            $this->plugin->enqueueAssets();
        }

        return $html;
    }

    protected function editorNotice(string $message): string
    {
        if (!current_user_can('edit_posts')) {
            return '';
        }

        return '<div class="hub-notice hub-notice--editor" role="note"><strong>[Hub Connector]</strong> ' . esc_html($message) . '</div>';
    }

    /** @param list<string> $allowed */
    protected function oneOf(string $name, string $value, array $allowed): string
    {
        if (!in_array($value, $allowed, true)) {
            throw new InvalidAttribute(sprintf(__('Valor no válido en el atributo %1$s: "%2$s".', 'hub-connector'), $name, $value));
        }

        return $value;
    }

    /** Lista separada por comas de ids (uuid) o códigos ^[a-z0-9-]+$. @return list<string> */
    protected function codes(string $name, string $value): array
    {
        if ($value === '') {
            return [];
        }
        $items = array_values(array_unique(array_filter(array_map('trim', explode(',', $value)), 'strlen')));
        foreach ($items as $item) {
            if (!self::isCode($item)) {
                throw new InvalidAttribute(sprintf(__('Valor no válido en el atributo %1$s: "%2$s".', 'hub-connector'), $name, $item));
            }
        }
        if (count($items) > 50) {
            throw new InvalidAttribute(sprintf(__('Demasiados valores en el atributo %s.', 'hub-connector'), $name));
        }

        return $items;
    }

    protected static function isCode(string $value): bool
    {
        return (bool) preg_match('/^[a-z0-9][a-z0-9_-]{0,79}$/', $value);
    }

    protected static function isUuid(string $value): bool
    {
        return (bool) preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/', $value);
    }

    /** ciclo en español → ciclo del sistema; vacío → $default. */
    protected function cycle(string $value, string $default): string
    {
        $value = $value === '' ? $default : $value;

        return self::CYCLES[$this->oneOf('ciclo', $value, array_keys(self::CYCLES))];
    }

    /** @return list<string> monedas a pedir: la del atributo o todas las de la marca */
    protected function currencies(string $moneda): array
    {
        if ($moneda !== '') {
            return [$this->oneOf('moneda', strtoupper($moneda), self::CURRENCIES)];
        }
        $site = $this->plugin->cache()->site();
        $list = is_array($site['currencies'] ?? null) ? array_values(array_intersect(self::CURRENCIES, $site['currencies'])) : [];

        return $list !== [] ? $list : ['PEN'];
    }

    /** Moneda visible al cargar: atributo, ajuste del sitio o la primera de la marca. */
    protected function visibleCurrency(array $currencies): string
    {
        $default = $this->plugin->settings()->defaultCurrency();

        return in_array($default, $currencies, true) ? $default : $currencies[0];
    }

    /**
     * Resultado sin datos utilizables: aviso al editor (404/422) o, si el sistema no
     * responde y ya no hay última copia, el aviso amable con el contacto (docs/13 §7).
     */
    protected function unavailable(array $result, string $what): string
    {
        if ($result['status'] === 'not_found') {
            return $this->editorNotice(sprintf(__('No existe o no pertenece a esta marca: %s.', 'hub-connector'), $what));
        }
        if ($result['status'] === 'invalid') {
            return $this->editorNotice(sprintf(__('El sistema rechazó los atributos de %s.', 'hub-connector'), $what));
        }
        $contact = $this->plugin->cache()->peekStale(Endpoints::CONTACT);
        if (!is_array($contact) || $contact === []) {
            return '';
        }

        return $this->plugin->templates()->render('unavailable', ['contact' => $this->contactItems($contact, 'todos')]);
    }

    /** @return list<array{kind:string, label:string, value:string, href:string}> */
    protected function contactItems(array $rows, string $field): array
    {
        $kinds = ['telefono' => 'phone', 'correo' => 'email', 'whatsapp' => 'whatsapp', 'direccion' => 'address', 'horario' => 'hours'];
        $lang = $this->plugin->settings()->lang();
        $items = [];
        foreach ($rows as $row) {
            if (!is_array($row) || !is_string($row['value'] ?? null) || !in_array($row['kind'] ?? '', $kinds, true)) {
                continue;
            }
            if ($field !== 'todos' && ($kinds[$field] ?? '') !== $row['kind']) {
                continue;
            }
            $label = is_array($row['label'] ?? null) ? (string) ($row['label'][$lang] ?? $row['label']['es'] ?? '') : '';
            $items[] = ['kind' => $row['kind'], 'label' => $label, 'value' => $row['value'], 'href' => self::contactHref($row['kind'], $row['value'])];
        }

        return $items;
    }

    protected static function contactHref(string $kind, string $value): string
    {
        $digits = preg_replace('/[^0-9]/', '', $value);

        return match ($kind) {
            'phone' => $digits !== '' ? 'tel:' . (str_starts_with(trim($value), '+') ? '+' : '') . $digits : '',
            'email' => is_email($value) ? 'mailto:' . $value : '',
            'whatsapp' => $digits !== '' ? 'https://wa.me/' . $digits : '',
            default => '',
        };
    }

    /**
     * Modelo de vista de un plan (sin escapar: escapan las plantillas).
     *
     * @param array<string, array<string, mixed>> $prices moneda → price del sistema
     */
    protected function planView(array $plan, array $prices): array
    {
        $lang = $this->plugin->settings()->lang();
        $highlights = [];
        foreach ((array) ($plan['highlights'] ?? []) as $item) {
            $text = is_array($item) ? ($item[$lang] ?? $item['es'] ?? $item['text'] ?? null) : $item;
            if (is_scalar($text) && (string) $text !== '') {
                $highlights[] = (string) $text;
            }
        }
        $name = (string) ($plan['name'] ?? '');
        $cycle = (string) ($plan['cycle'] ?? '');
        $formatted = [];
        foreach ($prices as $currency => $price) {
            $formatted[$currency] = self::price($currency, (int) ($price['amount_minor'] ?? 0), (int) ($price['setup_fee_minor'] ?? 0));
        }

        return [
            'id' => (string) ($plan['id'] ?? ''),
            'code' => (string) ($plan['code'] ?? ''),
            'name' => $name,
            'tagline' => is_string($plan['tagline'] ?? null) ? self::pluralize($plan['tagline']) : '',
            'specs' => is_string($plan['tagline'] ?? null) ? self::specs($plan['tagline']) : [],
            'highlights' => $highlights,
            'featured' => !empty($plan['featured']),
            'cycle' => $cycle,
            'cycle_label' => self::cycleLabel($cycle),
            'prices' => $formatted,
            'action' => $this->action($plan, $name),
        ];
    }

    /**
     * «1 sitio(s)» → «1 sitio», «5 sitio(s)» → «5 sitios» (también «(es)»): el sistema
     * entrega textos con plural genérico y la web los muestra concordados.
     */
    public static function pluralize(string $text): string
    {
        return (string) preg_replace_callback('/(\d+)(\s+)(\p{L}+)\((e?s)\)/u', static function (array $m): string {
            return $m[1] . $m[2] . $m[3] . ((int) $m[1] === 1 ? '' : $m[4]);
        }, $text);
    }

    /**
     * Especificaciones de la tarjeta a partir del lema «10 GB · 1 sitio(s)»: el punto medio
     * (o la barra vertical) del sistema se convierte en lista, no en separador decorativo.
     *
     * @return list<string>
     */
    public static function specs(string $tagline): array
    {
        $parts = preg_split('/\s*[·|•]\s*/u', self::pluralize($tagline)) ?: [];

        return array_values(array_filter(array_map('trim', $parts), 'strlen'));
    }

    /**
     * Mientras el sistema no entregue la URL del carrito (D-19), la tarjeta lleva a la
     * página de cotización con el plan elegido: /cotizacion/?plan=<código>.
     */
    protected function quoteFallback(array $view): array
    {
        if ($view['action'] !== null || $view['code'] === '') {
            return $view;
        }
        $label = __('Elegir plan', 'hub-connector');
        $view['action'] = [
            'url' => add_query_arg(['plan' => rawurlencode($view['code'])], home_url('/cotizacion/')),
            'text' => $label,
            'aria' => trim($label . ' ' . $view['name'] . ' ' . $view['cycle_label']),
        ];

        return $view;
    }

    /** Botón de contratar hacia central_urls.cart; sin carrito definido no hay botón (D-19/D-20). */
    protected function action(array $plan, string $name, string $text = ''): ?array
    {
        $site = $this->plugin->cache()->site();
        $urls = is_array($site['central_urls'] ?? null) ? $site['central_urls'] : [];
        $online = !empty($plan['sellable_online']);
        $target = $online ? ($urls['cart'] ?? '') : ($urls['quote'] ?? '');
        if (!is_string($target) || !preg_match('#^https://#i', $target)) {
            return null;
        }
        $label = $text !== '' ? $text : ($online ? __('Contratar', 'hub-connector') : __('Solicitar cotización', 'hub-connector'));
        $url = add_query_arg(array_map('rawurlencode', array_filter([
            'plan' => (string) ($plan['id'] ?? ''),
            'cycle' => (string) ($plan['cycle'] ?? ''),
            'brand' => (string) ($site['brand']['code'] ?? ''),
            'site' => (string) ($site['site']['id'] ?? ''),
        ], 'strlen')), $target);

        return [
            'url' => $url,
            'text' => $label,
            'aria' => trim($label . ' ' . $name . ' ' . self::cycleLabel((string) ($plan['cycle'] ?? ''))),
        ];
    }

    /** @return array{amount:string, symbol:string, currency_text:string, setup:string} */
    protected static function price(string $currency, int $minor, int $setupMinor): array
    {
        return [
            'amount' => number_format_i18n($minor / 100, 2),
            'symbol' => $currency === 'USD' ? 'US$' : 'S/',
            'currency_text' => $currency === 'USD' ? __('dólares', 'hub-connector') : __('soles', 'hub-connector'),
            'setup' => $setupMinor > 0 ? number_format_i18n($setupMinor / 100, 2) : '',
        ];
    }

    protected static function cycleLabel(string $cycle): string
    {
        return match ($cycle) {
            'monthly' => __('al mes', 'hub-connector'),
            'quarterly' => __('al trimestre', 'hub-connector'),
            'semiannual' => __('al semestre', 'hub-connector'),
            'annual' => __('al año', 'hub-connector'),
            'biennial' => __('cada 2 años', 'hub-connector'),
            'triennial' => __('cada 3 años', 'hub-connector'),
            'one_time' => __('pago único', 'hub-connector'),
            default => '',
        };
    }
}
