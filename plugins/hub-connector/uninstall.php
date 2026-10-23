<?php
/**
 * Desinstalación (docs/13 §16): borra opciones y transients hubc_ de todos los sitios.
 * Desactivar no borra nada.
 */
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

$hubConnectorCleanup = static function (): void {
    global $wpdb;
    foreach (['hub_connector_settings', 'hubc_index', 'hubc_status'] as $option) {
        delete_option($option);
    }
    $like = [
        $wpdb->esc_like('_transient_hubc_') . '%',
        $wpdb->esc_like('_transient_timeout_hubc_') . '%',
        $wpdb->esc_like('hubc_lock_') . '%',
    ];
    foreach ($like as $pattern) {
        $wpdb->query($wpdb->prepare("DELETE FROM {$wpdb->options} WHERE option_name LIKE %s", $pattern));
    }
};

if (is_multisite()) {
    foreach (get_sites(['fields' => 'ids', 'number' => 0]) as $blogId) {
        switch_to_blog((int) $blogId);
        $hubConnectorCleanup();
        restore_current_blog();
    }
    delete_site_option('hub_connector_network');
} else {
    $hubConnectorCleanup();
}
