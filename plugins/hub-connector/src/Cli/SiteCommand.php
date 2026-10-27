<?php

namespace HubConnector\Cli;

use HubConnector\SiteInstaller;

/** Comandos WP-CLI de la web comercial. */
final class SiteCommand
{
    /**
     * Crea o actualiza la web comercial (páginas, menús, cabecera, pie, 404, estilos, Kadence y Yoast).
     *
     * No pisa contenidos editados a mano (meta _hub_site_hash) salvo con --force.
     *
     * ## OPTIONS
     *
     * [--portal-url=<url>]
     * : Enlace del botón «Portal del cliente». Por defecto HUB_PORTAL_URL o /portal/ (D-19 abierta).
     *
     * [--force]
     * : Reemplaza también contenidos editados a mano y vuelve a aplicar los ajustes.
     *
     * ## EXAMPLES
     *
     *     wp hub-connector install-site
     *     wp hub-connector install-site --portal-url=https://portal.alojamientoplus.pe/
     *
     * @subcommand install-site
     */
    public function install_site(array $args, array $assoc): void
    {
        $installer = new SiteInstaller(!empty($assoc['force']));
        foreach ($installer->install($assoc['portal-url'] ?? null) as $line) {
            \WP_CLI::log($line);
        }
        \WP_CLI::success('Web instalada.');
    }
}
