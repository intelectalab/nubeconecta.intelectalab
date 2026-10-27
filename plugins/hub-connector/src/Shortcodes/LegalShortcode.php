<?php

namespace HubConnector\Shortcodes;

use HubConnector\Api\Endpoints;
use HubConnector\Plugin;

/**
 * [hub_legal slug="politica-de-privacidad" titulo="si"] (wpGetLegalDocument): título,
 * versión, fecha de vigencia y texto de la versión publicada de la marca, impreso
 * con wp_kses_post. También responde como [hub_documento_legal tipo="privacidad"]
 * (docs/13 §8), que traduce el tipo al `kind` del sistema.
 */
class LegalShortcode extends AbstractShortcode
{
    public const TYPES = [
        'terminos' => 'terms',
        'privacidad' => 'privacy',
        'reembolsos' => 'refunds',
        'sla' => 'sla',
        'uso-aceptable' => 'acceptable-use',
        'aviso-legal' => 'legal-notice',
    ];

    public function __construct(Plugin $plugin, private string $tag = 'hub_legal')
    {
        parent::__construct($plugin);
    }

    public function tag(): string
    {
        return $this->tag;
    }

    protected function defaults(): array
    {
        return ['slug' => '', 'tipo' => '', 'titulo' => 'si'];
    }

    protected function render(array $atts): string
    {
        $slug = $atts['slug'];
        if ($slug === '' && $atts['tipo'] !== '') {
            $slug = self::TYPES[$this->oneOf('tipo', $atts['tipo'], array_keys(self::TYPES))];
        }
        if ($slug === '' || strlen($slug) > 120 || !preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $slug)) {
            throw new InvalidAttribute(__('El atributo slug es obligatorio (por ejemplo, politica-de-privacidad).', 'hub-connector'));
        }
        $showTitle = $this->oneOf('titulo', $atts['titulo'], ['si', 'no']) === 'si';

        $result = $this->plugin->cache()->fetch(Endpoints::legalDocument($slug), ['lang' => $this->plugin->settings()->lang()], 'legal_document', [$slug]);
        $doc = $result['data'];
        if (!is_array($doc) || !is_string($doc['body'] ?? null)) {
            return $this->unavailable($result, 'slug="' . $slug . '"');
        }
        $effective = is_string($doc['effective_at'] ?? null) ? strtotime($doc['effective_at']) : false;

        return $this->plugin->templates()->render('legal', [
            'title' => is_string($doc['title'] ?? null) ? $doc['title'] : '',
            'show_title' => $showTitle,
            'slug' => $slug,
            'version' => is_string($doc['version_label'] ?? null) ? $doc['version_label'] : '',
            'effective' => $effective ? date_i18n((string) (get_option('date_format') ?: 'Y-m-d'), $effective) : '',
            'effective_iso' => $effective ? gmdate('Y-m-d', $effective) : '',
            'body' => $doc['body'],
        ]);
    }
}
