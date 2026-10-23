<?php

namespace HubConnector\Admin;

use HubConnector\Api\Endpoints;
use HubConnector\Api\HubClient;
use HubConnector\Plugin;
use HubConnector\Security\SecretBox;

/**
 * Ajustes > Hub Connector (docs/13 §4): capacidad manage_options y nonce.
 * El token se muestra solo con sus últimos cuatro caracteres y los secretos
 * nunca se vuelven a imprimir en el formulario.
 */
final class SettingsPage
{
    private const SLUG = 'hub-connector';

    public function __construct(private Plugin $plugin)
    {
    }

    public function register(): void
    {
        add_action('admin_menu', function (): void {
            add_options_page('Hub Connector', 'Hub Connector', 'manage_options', self::SLUG, [$this, 'render']);
        });
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $settings = $this->plugin->settings();
        $messages = [];
        $test = null;

        if ($_SERVER['REQUEST_METHOD'] === 'POST') {
            check_admin_referer('hub_connector_settings');
            $action = sanitize_key(wp_unslash($_POST['hub_action'] ?? 'save'));
            if ($action === 'save') {
                $before = $settings->fingerprint();
                $errors = $settings->save(wp_unslash($_POST));
                if ($settings->fingerprint() !== $before) {
                    $this->plugin->cache()->purgeAll();
                }
                $messages = $errors === [] ? [['success', __('Configuración guardada.', 'hub-connector')]] : array_map(static fn ($e) => ['error', $e], $errors);
            } elseif ($action === 'test') {
                $test = (new HubClient($settings))->get(Endpoints::SITE);
                if ($test['status'] === 200) {
                    $this->plugin->cache()->clearBlock();
                }
            } elseif ($action === 'flush') {
                $this->plugin->cache()->invalidate('all');
                $this->plugin->cache()->clearBlock();
                $messages[] = ['success', __('Caché vaciada: la siguiente visita trae los datos nuevos.', 'hub-connector')];
            }
        }

        $all = $settings->all();
        echo '<div class="wrap"><h1>' . esc_html__('Hub Connector: conexión con el sistema central', 'hub-connector') . '</h1>';
        foreach ($messages as [$type, $text]) {
            echo '<div class="notice notice-' . esc_attr($type) . '"><p>' . esc_html($text) . '</p></div>';
        }
        if (SecretBox::saltsMissing()) {
            echo '<div class="notice notice-warning"><p>' . esc_html__('wp-config.php no define AUTH_KEY y SECURE_AUTH_SALT propias: el cifrado de credenciales es débil.', 'hub-connector') . '</p></div>';
        }
        if ($test !== null) {
            $this->renderTest($test);
        }

        echo '<form method="post">';
        wp_nonce_field('hub_connector_settings');
        echo '<table class="form-table" role="presentation">';
        $this->row('hub_url', __('URL del sistema (API)', 'hub-connector'), '<input type="url" name="hub_url" id="hub_url" class="regular-text" placeholder="https://" value="' . esc_attr((string) ($all['hub_url'] ?? '')) . '">', __('HTTPS obligatorio. Se añade /api/v1 si no lo incluye.', 'hub-connector'));
        $this->row('brand', __('Marca del sitio', 'hub-connector'), '<input type="text" name="brand" id="brand" class="regular-text" value="' . esc_attr($settings->brand()) . '">', __('Código de la marca; los avisos de otra marca se rechazan.', 'hub-connector'));
        $last4 = $settings->tokenLast4();
        $this->row('token', __('Clave del sitio (token de solo lectura)', 'hub-connector'), '<input type="password" name="token" id="token" class="regular-text" value="" autocomplete="new-password">', $settings->hasSecret('token') ? sprintf(__('Guardada (termina en …%s). Déjalo vacío para conservarla.', 'hub-connector'), $last4) : __('Créala en el panel del sistema (Conector web > Tokens).', 'hub-connector'));
        $this->row('webhook_secret', __('Secreto de avisos (webhook)', 'hub-connector'), '<input type="password" name="webhook_secret" id="webhook_secret" class="regular-text" value="" autocomplete="new-password">', $settings->hasSecret('webhook_secret') ? __('Configurado. Déjalo vacío para conservarlo.', 'hub-connector') : __('Sin configurar: todos los avisos se rechazan.', 'hub-connector'));
        $this->row('previous_webhook_secret', __('Secreto anterior (rotación)', 'hub-connector'), '<input type="password" name="previous_webhook_secret" id="previous_webhook_secret" class="regular-text" value="" autocomplete="new-password"> <label><input type="checkbox" name="clear_previous_webhook_secret" value="1"> ' . esc_html__('Borrar', 'hub-connector') . '</label>', $settings->hasSecret('previous_webhook_secret') ? __('Configurado. Bórralo al terminar la rotación.', 'hub-connector') : __('Solo durante una rotación de secreto.', 'hub-connector'));
        $mode = $settings->submissionMode();
        $this->row('submission_mode', __('Envío de formularios', 'hub-connector'), '<select name="submission_mode" id="submission_mode"><option value="direct"' . selected($mode, 'direct', false) . '>' . esc_html__('Directo (el navegador envía al sistema)', 'hub-connector') . '</option><option value="relay"' . selected($mode, 'relay', false) . '>' . esc_html__('Reenvío (el plugin reenvía sin guardar)', 'hub-connector') . '</option></select>', '');
        $this->row('load_default_css', __('CSS del plugin', 'hub-connector'), '<label><input type="checkbox" name="load_default_css" id="load_default_css" value="1"' . checked($settings->loadDefaultCss(), true, false) . '> ' . esc_html__('Cargar el CSS mínimo', 'hub-connector') . '</label>', '');
        $currency = $settings->defaultCurrency();
        $this->row('default_currency', __('Moneda inicial', 'hub-connector'), '<select name="default_currency" id="default_currency"><option value="">' . esc_html__('La de la marca', 'hub-connector') . '</option><option value="PEN"' . selected($currency, 'PEN', false) . '>PEN</option><option value="USD"' . selected($currency, 'USD', false) . '>USD</option></select>', '');
        echo '</table>';
        echo '<p class="submit"><button type="submit" name="hub_action" value="save" class="button button-primary">' . esc_html__('Guardar cambios', 'hub-connector') . '</button> ';
        echo '<button type="submit" name="hub_action" value="test" class="button">' . esc_html__('Probar conexión', 'hub-connector') . '</button> ';
        echo '<button type="submit" name="hub_action" value="flush" class="button">' . esc_html__('Vaciar caché', 'hub-connector') . '</button></p>';
        echo '</form>';
        $this->renderStatus();
        echo '</div>';
    }

    private function row(string $id, string $label, string $control, string $help): void
    {
        // $control se arma arriba solo con valores escapados.
        echo '<tr><th scope="row"><label for="' . esc_attr($id) . '">' . esc_html($label) . '</label></th><td>' . $control;
        if ($help !== '') {
            echo '<p class="description">' . esc_html($help) . '</p>';
        }
        echo '</td></tr>';
    }

    private function renderTest(array $test): void
    {
        if ($test['status'] !== 200 || !is_array($test['data'] ?? null)) {
            $text = match ($test['status']) {
                0 => ($test['error'] ?? '') === 'not_configured' ? __('Falta la URL o la clave del sitio.', 'hub-connector') : __('El sistema no respondió.', 'hub-connector'),
                401 => __('El token fue rechazado (revocado, vencido o inválido): crea uno nuevo en el panel del sistema.', 'hub-connector'),
                426 => __('El sistema exige una versión más nueva del plugin.', 'hub-connector'),
                429 => __('Límite de peticiones alcanzado; inténtalo en unos minutos.', 'hub-connector'),
                default => sprintf(__('El sistema respondió con el código %d.', 'hub-connector'), (int) $test['status']),
            };
            echo '<div class="notice notice-error"><p>' . esc_html($text) . '</p></div>';

            return;
        }
        $d = $test['data'];
        $rows = [
            __('Marca', 'hub-connector') => (string) ($d['brand']['name'] ?? '') . ' (' . (string) ($d['brand']['code'] ?? '') . ')',
            __('Idioma', 'hub-connector') => (string) ($d['brand']['locale'] ?? ''),
            __('Monedas', 'hub-connector') => implode(', ', array_map('strval', (array) ($d['currencies'] ?? []))),
            __('Duración de la caché (s)', 'hub-connector') => (string) ($d['cache_ttl_seconds'] ?? ''),
            __('Última copia máxima (h)', 'hub-connector') => (string) ($d['stale_max_hours'] ?? ''),
            __('Versión mínima del plugin', 'hub-connector') => (string) ($d['min_plugin_version'] ?? ''),
            __('URL de invalidación (webhook_url en el panel)', 'hub-connector') => rest_url('hub-connector/v1/invalidate'),
        ];
        if (($d['brand']['code'] ?? '') !== $this->plugin->settings()->brand()) {
            echo '<div class="notice notice-warning"><p>' . esc_html__('La marca configurada no coincide con la del token: los avisos se rechazarán.', 'hub-connector') . '</p></div>';
        }
        echo '<div class="notice notice-success"><p>' . esc_html__('Conexión correcta.', 'hub-connector') . '</p><table class="widefat striped"><tbody>';
        foreach ($rows as $label => $value) {
            echo '<tr><th scope="row">' . esc_html($label) . '</th><td><code>' . esc_html($value) . '</code></td></tr>';
        }
        echo '</tbody></table></div>';
    }

    private function renderStatus(): void
    {
        $status = $this->plugin->cache()->status();
        $format = (string) get_option('date_format') . ' ' . (string) get_option('time_format');
        echo '<h2>' . esc_html__('Estado de la caché', 'hub-connector') . '</h2><ul>';
        echo '<li>' . esc_html__('Última renovación correcta:', 'hub-connector') . ' ' . esc_html(isset($status['last_success']) ? date_i18n($format, (int) $status['last_success']) : __('nunca', 'hub-connector')) . '</li>';
        if (isset($status['last_error']['at'])) {
            echo '<li>' . esc_html(sprintf(__('Último error: %1$s (código %2$d, %3$s)', 'hub-connector'), date_i18n($format, (int) $status['last_error']['at']), (int) $status['last_error']['status'], (string) $status['last_error']['code'])) . '</li>';
        }
        echo '<li>' . esc_html(sprintf(__('Entradas servidas desde la última copia: %d', 'hub-connector'), count((array) ($status['stale'] ?? [])))) . '</li></ul>';
    }
}
