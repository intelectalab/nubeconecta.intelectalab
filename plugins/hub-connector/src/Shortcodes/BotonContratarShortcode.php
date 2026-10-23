<?php

namespace HubConnector\Shortcodes;

/**
 * [hub_boton_contratar plan="<uuid>" ciclo="" texto=""] (docs/13 §8): valida el
 * plan con wpGetPlan y enlaza a central_urls.cart (o cotización si no se vende en línea).
 */
class BotonContratarShortcode extends PlanShortcode
{
    private string $text = '';

    public function tag(): string
    {
        return 'hub_boton_contratar';
    }

    protected function defaults(): array
    {
        return ['plan' => '', 'ciclo' => '', 'texto' => ''];
    }

    /** @param mixed $atts */
    public function handle($atts = []): string
    {
        // texto es libre: se conserva con mayúsculas y se sanea aparte.
        $text = is_array($atts) ? sanitize_text_field((string) ($atts['texto'] ?? '')) : '';
        $this->text = mb_substr($text, 0, 80);

        return parent::handle($atts);
    }

    protected function render(array $atts): string
    {
        if ($atts['ciclo'] !== '') {
            $this->cycle($atts['ciclo'], 'anual');
        }
        $plan = $this->loadPlan($atts['plan'], 'PEN', $prices, $result);
        if ($plan === null) {
            return $this->unavailable($result, 'plan="' . $atts['plan'] . '"');
        }
        $action = $this->action($plan, (string) ($plan['name'] ?? ''), $this->text);
        if ($action === null) {
            return $this->editorNotice(__('El sistema aún no entrega la URL del carrito (central_urls.cart) para esta marca.', 'hub-connector'));
        }

        return $this->plugin->templates()->render('buy-button', ['action' => $action]);
    }
}
