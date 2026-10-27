<?php

namespace HubConnector;

/** Editable starter pages for the WordPress brand site. */
final class PublicSite
{
    private const PAGES = [
        'inicio' => 'Inicio',
        'hosting' => 'Hosting',
        'servidores-vps' => 'Servidores VPS',
        'dominios' => 'Dominios',
        'contacto' => 'Contacto',
    ];

    public static function boot(): void
    {
        add_shortcode('hub_public_page', [self::class, 'render']);
        add_filter('the_title', [self::class, 'filterTitle'], 10, 2);
        add_action('wp_head', [self::class, 'hideThemeChrome'], 1);
        add_filter('render_block', [self::class, 'removeThemeTemplateParts'], 10, 2);
        add_action('init', [self::class, 'ensurePages'], 30);
        add_action('wp_enqueue_scripts', [self::class, 'assets']);
        add_action('enqueue_block_editor_assets', [self::class, 'editorAssets']);
    }

    public static function filterTitle(string $title, int $postId): string
    {
        $page = get_post($postId);
        return $page instanceof \WP_Post && isset(self::PAGES[$page->post_name]) ? '' : $title;
    }

    public static function hideThemeChrome(): void
    {
        if (!is_front_page() && !is_page(array_keys(self::PAGES))) {
            return;
        }
        echo '<style id="hub-public-theme-reset">html,body{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;overflow-x:hidden!important}.wp-site-blocks{width:100%!important;max-width:none!important;margin:0!important;padding:0!important;gap:0!important}.wp-site-blocks>main,.wp-site-blocks>main>.wp-block-group,.wp-site-blocks .wp-block-post-content,.wp-site-blocks .entry-content{position:static!important;left:auto!important;transform:none!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important}.wp-block-post-title,.wp-block-post-content>.wp-block-post-title{display:none!important}.hub-public,.hub-public.wp-block-group{position:relative!important;left:auto!important;transform:none!important;width:100%!important;max-width:none!important;min-width:0!important;margin:0!important;padding:0!important}.hub-public__hero.wp-block-group{width:100%!important;max-width:none!important;margin:0!important}.hub-public__hero-inner.wp-block-group{position:relative!important;left:auto!important;transform:none!important;width:100%!important;max-width:1160px!important;min-width:0!important;margin:0 auto!important;padding:0!important}.hub-public__section.wp-block-group{width:100%!important;max-width:1160px!important;min-width:0!important;margin:0 auto!important}.hub-public__grid.wp-block-group{width:100%!important;max-width:none!important;min-width:0!important}.hub-public__cta.wp-block-group{width:100%!important;max-width:none!important;min-width:0!important}</style>';
    }

    public static function removeThemeTemplateParts(string $content, array $block): string
    {
        if (!is_page(array_keys(self::PAGES)) || ($block['blockName'] ?? '') !== 'core/template-part') {
            return $content;
        }
        $slug = strtolower((string) ($block['attrs']['slug'] ?? ''));
        return in_array($slug, ['header', 'footer'], true) ? '' : $content;
    }

    public static function ensurePages(): void
    {
        $homeId = 0;
        foreach (self::PAGES as $slug => $title) {
            $page = get_page_by_path($slug, OBJECT, 'page');
            if (!$page) {
                $id = wp_insert_post([
                    'post_type' => 'page',
                    'post_status' => 'publish',
                    'post_title' => $title,
                    'post_name' => $slug,
                    'post_content' => self::editableContent($slug),
                ], true);
                if (is_wp_error($id)) {
                    continue;
                }
                $page = get_post($id);
            } else {
                $blocks = parse_blocks((string) $page->post_content);
                $legacyStarter = count($blocks) === 1
                    && ($blocks[0]['blockName'] ?? '') === 'core/html'
                    && strpos((string) ($blocks[0]['innerHTML'] ?? ''), 'class="hub-public"') !== false;
                $legacyShortcode = trim((string) $page->post_content) === '[hub_public_page]';
                if ($legacyStarter || $legacyShortcode) {
                    wp_update_post(wp_slash([
                        'ID' => (int) $page->ID,
                        'post_content' => self::editableContent($slug),
                    ]));
                    $page = get_post($page->ID);
                }
            }
            if ($slug === 'inicio' && $page) {
                $homeId = (int) $page->ID;
            }
        }
        if ($homeId && (int) get_option('page_on_front') !== $homeId) {
            update_option('show_on_front', 'page');
            update_option('page_on_front', $homeId);
        }
    }

    public static function assets(): void
    {
        if (is_singular('page')) {
            wp_enqueue_style('hub-public-site', HUB_CONNECTOR_PLUGIN_URL . 'assets/public-site.css', [], HUB_CONNECTOR_VERSION);
        }
    }

    public static function editorAssets(): void
    {
        wp_enqueue_style('hub-public-site-editor', HUB_CONNECTOR_PLUGIN_URL . 'assets/public-site.css', [], HUB_CONNECTOR_VERSION);
    }

    public static function render(): string
    {
        $page = get_post(get_queried_object_id());
        $slug = $page instanceof \WP_Post ? $page->post_name : 'inicio';
        return isset(self::PAGES[$slug]) ? self::renderLegacyPage($slug) : self::renderLegacyPage('inicio');
    }

    /** Builds native Gutenberg blocks so all page text and links are editable in the visual editor. */
    private static function editableContent(string $slug): string
    {
        $pages = [];
        foreach (self::PAGES as $path => $label) {
            $pages[$path] = ['label' => $label, 'url' => get_permalink(get_page_by_path($path, OBJECT, 'page')) ?: home_url('/' . $path . '/')];
        }
        $contact = $pages['contacto']['url'];
        $blocks = self::group('hub-public', self::headerBlocks($pages) . self::bodyBlocks($slug, $pages, $contact) . self::footerBlocks($pages));
        return $blocks;
    }

    private static function headerBlocks(array $pages): string
    {
        $links = '';
        foreach ($pages as $page) {
            $links .= self::paragraph('<a href="' . esc_url($page['url']) . '">' . esc_html($page['label']) . '</a>', 'hub-public__nav-link');
        }
        return self::group('hub-public__header', self::paragraph('<a class="hub-public__brand" href="' . esc_url(home_url('/')) . '">AlojamientoPlus</a>', 'hub-public__brand-wrap') . self::group('hub-public__nav', $links, 'nav') . self::button('Solicitar información', $pages['contacto']['url']), 'header');
    }

    private static function footerBlocks(array $pages): string
    {
        $links = '';
        foreach ($pages as $page) {
            $links .= self::paragraph('<a href="' . esc_url($page['url']) . '">' . esc_html($page['label']) . '</a>', 'hub-public__nav-link');
        }
        return self::group('hub-public__footer', self::heading('AlojamientoPlus', 3) . self::paragraph('Hosting, dominios y soluciones para tu negocio.') . self::group('hub-public__footer-nav', $links, 'nav'), 'footer');
    }

    private static function bodyBlocks(string $slug, array $pages, string $contact): string
    {
        if ($slug === 'hosting') {
            return self::group('hub-public__hero', self::paragraph('Alojamiento web', 'hub-public__eyebrow') . self::heading('Hosting para tu página y tus aplicaciones', 1) . self::paragraph('Cuéntanos qué necesitas alojar y revisaremos contigo las opciones disponibles.') . self::button('Consultar opciones', $contact))
                . self::section('Lo que podemos ayudarte a alojar', [
                    ['Tu web en línea', 'Publica tu sitio con una opción de alojamiento adecuada para tu proyecto.'],
                    ['Correo y dominios', 'Consulta opciones para reunir los servicios de tu negocio.'],
                    ['Acompañamiento', 'Contacta al equipo para revisar las alternativas disponibles.'],
                ])
                . self::cta('¿Buscas un servicio para tu negocio?', 'Comparte qué necesitas y ventas podrá orientarte sobre los siguientes pasos.', $contact);
        }
        if ($slug === 'servidores-vps') {
            return self::group('hub-public__hero', self::paragraph('Infraestructura', 'hub-public__eyebrow') . self::heading('Un servidor VPS adaptado a tu proyecto', 1) . self::paragraph('Comparte los recursos y el nivel de administración que necesitas para revisar alternativas.') . self::button('Consultar opciones', $contact))
                . self::section('Diseñado según tu carga', [
                    ['Recursos definidos', 'Describe memoria, almacenamiento y procesamiento que requiere tu servicio.'],
                    ['Administración a tu medida', 'Consulta alternativas administradas o autogestionadas.'],
                    ['Revisión con el equipo', 'Evaluaremos disponibilidad, ubicación y condiciones antes de cotizar.'],
                ]);
        }
        if ($slug === 'dominios') {
            return self::group('hub-public__hero', self::paragraph('Tu identidad en Internet', 'hub-public__eyebrow') . self::heading('Elige el dominio para tu negocio', 1) . self::paragraph('Cuéntanos qué nombre buscas y si necesitas registrar o transferir un dominio.') . self::button('Consultar opciones', $contact))
                . self::section('¿Necesitas ayuda con un dominio?', [['', 'Indícanos el nombre y la extensión que buscas; el equipo te ayudará a revisar las opciones disponibles.']]);
        }
        if ($slug === 'contacto') {
            return self::group('hub-public__hero', self::paragraph('Estamos para ayudarte', 'hub-public__eyebrow') . self::heading('Cuéntanos qué servicio necesitas', 1) . self::paragraph('Comunícate con ventas para consultar sobre hosting, servidores VPS o dominios.'))
                . self::group('hub-public__section hub-public__contact', self::heading('Contacto', 2) . self::group('hub-public__grid',
                    self::group('hub-public__card', self::heading('Ventas', 3) . self::paragraph('Consultas de servicios y cotizaciones.') . self::paragraph('<a href="mailto:ventas@alojamientoplus.com">ventas@alojamientoplus.com</a>'))
                    . self::group('hub-public__card', self::heading('Soporte', 3) . self::paragraph('Ayuda con servicios y consultas técnicas.') . self::paragraph('<a href="mailto:soporte@alojamientoplus.com">soporte@alojamientoplus.com</a>'))))
                . self::cta('¿Listo para conversar?', 'Escríbenos y cuéntanos cómo podemos ayudarte.', 'mailto:ventas@alojamientoplus.com');
        }

        return self::group('hub-public__hero', self::paragraph('AlojamientoPlus', 'hub-public__eyebrow') . self::heading('Servicios digitales para que tu negocio avance', 1) . self::paragraph('Encuentra opciones de hosting, servidores VPS y dominios para iniciar o hacer crecer tu proyecto.') . self::buttons([
            ['Explorar hosting', $pages['hosting']['url']],
            ['Solicitar información', $contact],
        ]))
            . self::section('Elige el servicio que necesitas', [
                ['Hosting web', 'Publica tu sitio con una opción de alojamiento adecuada para tu proyecto.', $pages['hosting']['url']],
                ['Servidores VPS', 'Evalúa recursos y administración según las necesidades de tu negocio.', $pages['servidores-vps']['url']],
                ['Dominios', 'Recibe orientación para elegir o transferir un dominio.', $pages['dominios']['url']],
            ])
            . self::cta('¿Tienes una idea en marcha?', 'Cuéntanos qué estás construyendo y te orientaremos sobre el siguiente paso.', $contact);
    }

    private static function section(string $title, array $cards): string
    {
        $items = '';
        foreach ($cards as $card) {
            $content = ($card[0] !== '' ? self::heading($card[0], 3) : '') . self::paragraph($card[1]);
            if (isset($card[2])) {
                $content .= self::paragraph('<a href="' . esc_url($card[2]) . '">Conocer más</a>');
            }
            $items .= self::group('hub-public__card', $content);
        }
        return self::group('hub-public__section', self::heading($title, 2) . self::group('hub-public__grid', $items));
    }

    private static function cta(string $title, string $text, string $url): string
    {
        return self::group('hub-public__cta', self::heading($title, 2) . self::paragraph($text) . self::button('Solicitar información', $url));
    }

    private static function buttons(array $items): string
    {
        $content = '';
        foreach ($items as [$label, $url]) {
            $content .= self::button($label, $url);
        }
        return self::group('hub-public__actions', $content);
    }

    private static function button(string $label, string $url): string
    {
        return '<!-- wp:buttons --><div class="wp-block-buttons"><!-- wp:button {"className":"hub-public__button","url":"' . esc_url($url) . '"} --><div class="wp-block-button hub-public__button"><a class="wp-block-button__link wp-element-button" href="' . esc_url($url) . '">' . esc_html($label) . '</a></div><!-- /wp:button --></div><!-- /wp:buttons -->';
    }

    private static function heading(string $text, int $level): string
    {
        return '<!-- wp:heading {"level":' . $level . '} --><h' . $level . ' class="wp-block-heading">' . esc_html($text) . '</h' . $level . '><!-- /wp:heading -->';
    }

    private static function paragraph(string $html, string $class = ''): string
    {
        $classAttr = $class !== '' ? ' {"className":"' . esc_attr($class) . '"}' : '';
        $htmlClass = $class !== '' ? ' class="' . esc_attr($class) . '"' : '';
        return '<!-- wp:paragraph' . $classAttr . ' --><p' . $htmlClass . '>' . $html . '</p><!-- /wp:paragraph -->';
    }

    private static function group(string $class, string $content, string $tag = 'div'): string
    {
        $attrs = ['className' => $class];
        if ($tag !== 'div') {
            $attrs['tagName'] = $tag;
        }
        $encoded = wp_json_encode($attrs, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $htmlClass = 'wp-block-group ' . $class;
        return '<!-- wp:group ' . $encoded . ' --><' . $tag . ' class="' . esc_attr($htmlClass) . '">' . $content . '</' . $tag . '><!-- /wp:group -->';
    }

    private static function renderLegacyPage(string $slug): string
    {
        $page = get_page_by_path($slug, OBJECT, 'page');
        return $page ? apply_filters('the_content', $page->post_content) : '';
    }
}
