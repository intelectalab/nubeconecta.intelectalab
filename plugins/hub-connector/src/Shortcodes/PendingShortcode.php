<?php

namespace HubConnector\Shortcodes;

use HubConnector\Plugin;

/**
 * Shortcodes de docs/13 §8 cuyo endpoint aún no publica el sistema (paquetes,
 * buscador de dominio, promociones, estado de servicios, servidores, WHOIS,
 * Libro, asistente). Se registran para que el contenido no muestre el
 * shortcode crudo: no pintan nada al visitante y avisan a los editores.
 */
final class PendingShortcode extends AbstractShortcode
{
    public const TAGS = [
        'hub_paquete', 'hub_buscar_dominio', 'hub_libro_reclamaciones', 'hub_asistente',
        'hub_estado_servicios', 'hub_promocion', 'hub_whois', 'hub_servidores',
    ];

    public function __construct(Plugin $plugin, private string $tag)
    {
        parent::__construct($plugin);
    }

    public function tag(): string
    {
        return $this->tag;
    }

    protected function defaults(): array
    {
        return [];
    }

    protected function render(array $atts): string
    {
        return $this->editorNotice(sprintf(__('[%s] aún no está disponible: el sistema todavía no publica estos datos.', 'hub-connector'), $this->tag));
    }
}
