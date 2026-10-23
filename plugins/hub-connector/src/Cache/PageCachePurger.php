<?php

namespace HubConnector\Cache;

/**
 * Purga de la caché de página de plugins compatibles tras un aviso (docs/13 §14).
 * La lista definitiva depende del plugin de caché elegido (D-33).
 */
final class PageCachePurger
{
    public function purge(): void
    {
        if (function_exists('rocket_clean_domain')) {
            rocket_clean_domain();
        }
        if (function_exists('w3tc_flush_all')) {
            w3tc_flush_all();
        }
        if (function_exists('wp_cache_clear_cache')) {
            wp_cache_clear_cache();
        }
        do_action('litespeed_purge_all');
    }
}
