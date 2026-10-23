<?php

namespace HubConnector\Admin;

use HubConnector\Plugin;

/** Avisos persistentes al administrador del sitio (docs/13 §5 y §4). */
final class Notices
{
    public function __construct(private Plugin $plugin)
    {
    }

    public function register(): void
    {
        add_action('admin_notices', [$this, 'render']);
    }

    public function render(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }
        $messages = [];
        if ($this->plugin->settings()->undecryptable() !== []) {
            $messages[] = __('Hub Connector: cambiaron las sales de wp-config.php y ya no se pueden leer el token o el secreto. Vuelve a pegarlos en Ajustes > Hub Connector.', 'hub-connector');
        }
        $block = $this->plugin->cache()->status()['block']['reason'] ?? '';
        if ($block === 'token') {
            $messages[] = __('Hub Connector: el token fue revocado o venció. Crea uno nuevo en el panel del sistema y pégalo en Ajustes > Hub Connector.', 'hub-connector');
        } elseif ($block === 'version') {
            $messages[] = __('Hub Connector: el sistema exige una versión más nueva del plugin. Actualízalo para seguir recibiendo datos.', 'hub-connector');
        }
        foreach ($messages as $message) {
            echo '<div class="notice notice-error"><p>' . esc_html($message) . '</p></div>';
        }
    }
}
