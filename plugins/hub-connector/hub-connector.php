<?php
/**
 * Plugin Name: Hub Connector
 * Plugin URI: https://alojamientoplus.pe
 * Description: Conecta los sitios web WordPress de las marcas con el sistema central Hub (catálogo, precios y contacto de la marca, con caché y avisos de invalidación firmados).
 * Version: 1.2.1
 * Author: AlojamientoPlus Core Team
 * License: Proprietary
 * Requires at least: 6.2
 * Requires PHP: 8.1
 * Network: true
 * Text Domain: hub-connector
 * Domain Path: /languages
 */

if (!defined('ABSPATH')) {
    exit;
}

define('HUB_CONNECTOR_VERSION', '1.2.1');
define('HUB_CONNECTOR_PLUGIN_FILE', __FILE__);
define('HUB_CONNECTOR_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('HUB_CONNECTOR_PLUGIN_URL', plugin_dir_url(__FILE__));

// Autoloader PSR-4 para clases del plugin en src/
spl_autoload_register(function ($class) {
    $prefix = 'HubConnector\\';
    $base_dir = HUB_CONNECTOR_PLUGIN_DIR . 'src/';

    $len = strlen($prefix);
    if (strncmp($prefix, $class, $len) !== 0) {
        return;
    }

    $relative_class = substr($class, $len);
    $file = $base_dir . str_replace('\\', '/', $relative_class) . '.php';

    if (file_exists($file)) {
        require_once $file;
    }
});

// The public site is included in the connector package and does not depend on API credentials.
require_once __DIR__ . '/public-site.php';

// Inicialización del plugin
add_action('plugins_loaded', function () {
    if (class_exists('HubConnector\\Plugin')) {
        HubConnector\Plugin::getInstance()->boot();
    }
});
