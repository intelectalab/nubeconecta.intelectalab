<?php
/**
 * AlojamientoPlus public pages, provisioned by the Hub Connector.
 */

if (!defined('ABSPATH')) {
    exit;
}

add_action('plugins_loaded', ['HubConnector\\PublicSite', 'boot'], 20);
