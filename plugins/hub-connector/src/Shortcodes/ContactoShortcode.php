<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;

/**
 * [hub_contacto campo="todos" formato="enlace"] (docs/13 §8, wpGetContact).
 * Enlaces tel:, mailto: y https://wa.me/ con texto accesible (docs/13 §11).
 */
class ContactoShortcode extends AbstractShortcode
{
    public function tag(): string
    {
        return 'hub_contacto';
    }

    protected function defaults(): array
    {
        return ['campo' => 'todos', 'formato' => 'enlace'];
    }

    protected function render(array $atts): string
    {
        $field = $this->oneOf('campo', $atts['campo'], ['telefono', 'correo', 'whatsapp', 'direccion', 'horario', 'todos']);
        $format = $this->oneOf('formato', $atts['formato'], ['texto', 'enlace', 'boton', 'lista']);

        // Se pide siempre la lista completa (una sola entrada de caché y última copia para el aviso de §7).
        $result = $this->plugin->cache()->fetch(Endpoints::CONTACT, [], 'contact');
        if (!is_array($result['data'])) {
            return $this->unavailable($result, 'contacto');
        }
        $items = $this->contactItems($result['data'], $field);
        if ($items === []) {
            return $this->editorNotice(__('La marca no tiene datos de contacto públicos para ese campo.', 'hub-connector'));
        }

        return $this->plugin->templates()->render('contact', ['items' => $items, 'format' => $format]);
    }
}
