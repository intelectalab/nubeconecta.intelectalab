<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_plan id="<uuid>" ciclo="" moneda=""] (docs/13 §8, wpGetPlan). El sistema
 * expone un plan por ciclo, así que ciclo solo se valida contra la lista cerrada.
 */
class PlanShortcode extends AbstractShortcode
{
    public function tag(): string
    {
        return 'hub_plan';
    }

    protected function defaults(): array
    {
        return ['id' => '', 'ciclo' => '', 'moneda' => ''];
    }

    protected function render(array $atts): string
    {
        $plan = $this->loadPlan($atts['id'], $atts['moneda'], $prices, $result);
        if ($plan === null) {
            return $this->unavailable($result, 'id="' . $atts['id'] . '"');
        }
        if ($atts['ciclo'] !== '') {
            $this->cycle($atts['ciclo'], 'anual');
        }
        $currencies = array_keys($prices);

        return $this->plugin->templates()->render('plan', [
            'plan' => $this->planView($plan, $prices),
            'currencies' => $currencies,
            'visible_currency' => $this->visibleCurrency($currencies !== [] ? $currencies : ['PEN']),
        ]);
    }

    /** @return array<string, mixed>|null */
    protected function loadPlan(string $id, string $moneda, ?array &$prices, ?array &$result): ?array
    {
        if (!self::isUuid($id)) {
            throw new InvalidAttribute(__('El atributo id (o plan) debe ser el id del plan.', 'hub-connector'));
        }
        $plan = null;
        $prices = [];
        $result = ['status' => 'missing', 'data' => null];
        $failure = null;
        foreach ($this->currencies($moneda) as $currency) {
            $result = $this->plugin->cache()->fetch(Endpoints::plan($id), ['currency' => $currency, 'lang' => $this->plugin->settings()->lang()], 'plan', static fn ($data) => array_values(array_filter([$id, (string) ($data['code'] ?? ''), (string) ($data['type'] ?? '')], 'strlen')));
            if (!is_array($result['data'])) {
                // Un plan sin precio en una de las monedas de la marca sigue mostrándose con las demás.
                $failure ??= $result;
                continue;
            }
            $plan ??= $result['data'];
            if (is_array($result['data']['price'] ?? null)) {
                $prices[$currency] = $result['data']['price'];
            }
        }
        if ($plan === null && $failure !== null) {
            $result = $failure;
        }

        return $plan;
    }
}
