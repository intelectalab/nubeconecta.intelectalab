<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_formulario id="contacto" origen="" boton=""] (docs/13 §8 y §9): formulario de
 * contacto o cotización con nombre, correo, teléfono, empresa y mensaje, casilla de
 * consentimiento con el texto del sistema y campo trampa oculto `website`. El
 * navegador envía sin recargar a la ruta de reenvío del plugin
 * (/wp-json/hub-connector/v1/relay/form/{id}), que lo pasa al sistema sin guardarlo.
 */
class FormularioShortcode extends AbstractShortcode
{
    public function tag(): string
    {
        return 'hub_formulario';
    }

    protected function defaults(): array
    {
        return ['id' => '', 'origen' => '', 'boton' => ''];
    }

    protected function render(array $atts): string
    {
        $code = $atts['id'];
        if ($code === '' || strlen($code) > 80 || !preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $code)) {
            throw new InvalidAttribute(__('El atributo id es obligatorio (código del formulario, por ejemplo contacto).', 'hub-connector'));
        }
        $source = $atts['origen'] !== '' ? $atts['origen'] : $code;
        if (!preg_match('/^[a-z0-9_-]{1,60}$/', $source)) {
            throw new InvalidAttribute(sprintf(__('Valor no válido en el atributo %1$s: "%2$s".', 'hub-connector'), 'origen', $source));
        }

        $result = $this->plugin->cache()->fetch(Endpoints::form($code), ['lang' => $this->plugin->settings()->lang()], 'form', [$code]);
        $form = $result['data'];
        if (!is_array($form)) {
            return $this->unavailable($result, 'id="' . $code . '"');
        }
        static $instance = 0;
        $instance++;
        $redirect = is_string($form['redirect_url'] ?? null) && str_starts_with($form['redirect_url'], 'https://') ? $form['redirect_url'] : '';

        [$consentText, $consentUrl] = self::consent(is_string($form['consent']['text'] ?? null) ? $form['consent']['text'] : __('Acepto la política de privacidad.', 'hub-connector'));

        return $this->plugin->templates()->render('form', [
            'uid' => 'hubf-' . $code . '-' . $instance,
            'code' => $code,
            'source' => $source,
            'action' => rest_url('hub-connector/v1/relay/form/' . $code),
            'nonce' => wp_create_nonce('hub_connector_form'),
            'consent_required' => !empty($form['consent']['required']),
            'consent_text' => $consentText,
            'consent_url' => $consentUrl,
            'success_message' => is_string($form['success_message'] ?? null) ? $form['success_message'] : __('Gracias. Recibimos tu mensaje.', 'hub-connector'),
            'redirect_url' => $redirect,
            'button' => $atts['boton'] !== '' ? ucfirst(sanitize_text_field($atts['boton'])) : ($code === 'cotizacion' ? __('Solicitar cotización', 'hub-connector') : __('Enviar mensaje', 'hub-connector')),
        ]);
    }

    /**
     * El texto de consentimiento del sistema puede traer la ruta de la política entre
     * paréntesis («política de privacidad (/politica-de-privacidad/)»): se quita del texto
     * y se usa como enlace. Sin ruta, se enlaza a /politica-de-privacidad/.
     *
     * @return array{0:string, 1:string} texto limpio y URL de la política
     */
    public static function consent(string $text): array
    {
        $path = '/politica-de-privacidad/';
        $clean = (string) preg_replace_callback('#\s*\(\s*((?:https?://[^\s()]+)|(?:/[a-z0-9/_-]*))\s*\)#iu', static function (array $m) use (&$path): string {
            $path = $m[1];

            return '';
        }, $text);
        $url = str_starts_with($path, '/') ? home_url($path) : $path;

        return [trim((string) preg_replace('/\s{2,}/u', ' ', $clean)), $url];
    }
}
