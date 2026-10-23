<?php

namespace HubConnector\Shortcodes;

/** [hub_selector_moneda] (docs/13 §8): botones con las monedas de wpGetSite. */
class SelectorMonedaShortcode extends AbstractShortcode
{
    public function tag(): string
    {
        return 'hub_selector_moneda';
    }

    protected function defaults(): array
    {
        return [];
    }

    protected function render(array $atts): string
    {
        $currencies = $this->currencies('');
        if (count($currencies) < 2) {
            return '';
        }

        return $this->plugin->templates()->render('currency-switcher', [
            'currencies' => $currencies,
            'visible_currency' => $this->visibleCurrency($currencies),
        ]);
    }
}
