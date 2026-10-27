<?php

namespace HubConnector;

/**
 * Instala la web comercial de la marca a partir de plugins/hub-connector/site/:
 * páginas (marcado de bloques Kadence), menús de navegación, cabecera, pie,
 * plantillas de página y 404, estilos globales, paleta de Kadence Blocks y
 * ajustes básicos de Yoast SEO.
 *
 * Idempotente y sin pisar ediciones manuales: cada contenido guarda
 * _hub_site_version y _hub_site_hash (md5 del contenido instalado). Si el
 * contenido actual ya no coincide con ese hash, alguien lo editó y se omite
 * (salvo con $force). Las opciones (Yoast, estilos, paleta) solo se fijan la
 * primera vez, marcadas en la opción hub_site_installed.
 */
final class SiteInstaller
{
    public const META_VERSION = '_hub_site_version';
    public const META_HASH = '_hub_site_hash';
    public const OPTION = 'hub_site_installed';
    public const PORTAL_OPTION = 'hub_connector_portal_url';

    private string $dir;
    private array $manifest;
    /** @var array<string,int> */
    private array $pageIds = [];
    /** @var array<string,int> */
    private array $navIds = [];
    /** @var list<string> */
    private array $log = [];

    public function __construct(private bool $force = false, ?string $dir = null)
    {
        $this->dir = rtrim($dir ?? HUB_CONNECTOR_PLUGIN_DIR . 'site', '/\\') . '/';
        $json = file_get_contents($this->dir . 'site.json');
        $manifest = is_string($json) ? json_decode($json, true) : null;
        if (!is_array($manifest) || !isset($manifest['version'], $manifest['pages'])) {
            throw new \RuntimeException('site/site.json no es válido.');
        }
        $this->manifest = $manifest;
    }

    public static function portalUrl(): string
    {
        $url = (string) get_option(self::PORTAL_OPTION, '');
        if ($url === '') {
            $url = (string) (getenv('HUB_PORTAL_URL') ?: '/portal/');
        }

        return $url;
    }

    /** Hooks de la web instalada: estilos de marca en el sitio y en el editor. */
    public static function registerFrontend(): void
    {
        $enqueue = static function (): void {
            if (!get_option(self::OPTION)) {
                return;
            }
            wp_enqueue_style('hub-site-fonts', 'https://fonts.googleapis.com/css2?family=Poppins:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@500&display=swap', [], null);
            wp_enqueue_style('hub-site', HUB_CONNECTOR_PLUGIN_URL . 'assets/site.css', ['hub-site-fonts'], HUB_CONNECTOR_VERSION . '.' . (int) @filemtime(HUB_CONNECTOR_PLUGIN_DIR . 'assets/site.css'));
        };
        add_action('wp_enqueue_scripts', $enqueue);
        add_action('enqueue_block_assets', $enqueue);
    }

    /** @return list<string> líneas del informe */
    public function install(?string $portalUrl = null): array
    {
        if (function_exists('kses_remove_filters')) {
            kses_remove_filters(); // el marcado viene del propio plugin (SVG del logo, clases)
        }
        if ($portalUrl !== null) {
            update_option(self::PORTAL_OPTION, esc_url_raw($portalUrl) ?: '/portal/');
        }
        $version = (string) $this->manifest['version'];

        foreach ($this->manifest['pages'] as $page) {
            $this->installPage($page, $version);
        }
        foreach (($this->manifest['menus'] ?? []) as $key => $menu) {
            $this->installNavigation((string) $key, $menu, $version);
        }
        $theme = get_stylesheet();
        foreach (($this->manifest['template_parts'] ?? []) as $slug => $part) {
            $this->installTemplate('wp_template_part', (string) $slug, $part, $theme, $version);
        }
        foreach (($this->manifest['templates'] ?? []) as $slug => $tpl) {
            $this->installTemplate('wp_template', (string) $slug, $tpl, $theme, $version);
        }
        $this->installOptions($version);

        return $this->log;
    }

    private function installPage(array $page, string $version): void
    {
        $slug = (string) $page['slug'];
        $content = $this->render((string) file_get_contents($this->dir . 'pages/' . $slug . '.html'));
        // Los borradores y pendientes no tienen post_name: se buscan por la meta _hub_site_slug.
        $existing = get_page_by_path($slug, OBJECT, 'page')
            ?: (get_posts(['post_type' => 'page', 'post_status' => 'any', 'numberposts' => 1, 'meta_key' => '_hub_site_slug', 'meta_value' => $slug])[0] ?? null);
        $meta = [];
        foreach (['_yoast_wpseo_title' => 'seo_title', '_yoast_wpseo_metadesc' => 'seo_description'] as $key => $field) {
            if (!empty($page[$field]) && (!$existing || $this->force || get_post_meta($existing->ID, $key, true) === '')) {
                $meta[$key] = (string) $page[$field];
            }
        }
        $postarr = [
            'post_type' => 'page',
            'post_name' => $slug,
            'post_title' => (string) $page['title'],
            'post_content' => $content,
            'post_status' => (string) ($page['status'] ?? 'publish'),
            'menu_order' => (int) ($page['order'] ?? 0),
            'meta_input' => $meta + ['_hub_site_slug' => $slug],
        ];
        $id = $this->upsert($existing ?: null, $postarr, 'página ' . $slug, $version, ['hub_public_page', 'wp-block-group hub-public']); // arranque anterior (PublicSite)
        if ($id > 0) {
            $this->pageIds[$slug] = $id;
            if (!empty($page['expire_days'])) {
                $this->scheduleExpiration($id, (int) $page['expire_days']);
            }
        }
    }

    private function installNavigation(string $key, array $menu, string $version): void
    {
        $name = 'hub-' . $key;
        $existing = get_posts(['post_type' => 'wp_navigation', 'name' => $name, 'post_status' => 'any', 'numberposts' => 1]);
        $content = '';
        foreach ($menu['items'] as $item) {
            $content .= $this->navItem($item);
        }
        $id = $this->upsert($existing[0] ?? null, [
            'post_type' => 'wp_navigation',
            'post_name' => $name,
            'post_title' => (string) $menu['title'],
            'post_content' => $content,
            'post_status' => 'publish',
        ], 'menú ' . $key, $version);
        if ($id > 0) {
            $this->navIds[$key] = $id;
        }
    }

    private function navItem(array $item): string
    {
        $slug = (string) $item['page'];
        $attrs = ['label' => (string) $item['label'], 'type' => 'page', 'url' => $this->url($slug), 'kind' => 'post-type'];
        if (isset($this->pageIds[$slug])) {
            $attrs['id'] = $this->pageIds[$slug];
        }
        $json = wp_json_encode($attrs, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if (empty($item['children'])) {
            return '<!-- wp:navigation-link ' . $json . ' /-->';
        }
        $inner = '';
        foreach ($item['children'] as $child) {
            $inner .= $this->navItem($child);
        }

        return '<!-- wp:navigation-submenu ' . $json . ' -->' . $inner . '<!-- /wp:navigation-submenu -->';
    }

    private function installTemplate(string $type, string $slug, array $def, string $theme, string $version): void
    {
        $existing = get_posts([
            'post_type' => $type, 'name' => $slug, 'post_status' => 'any', 'numberposts' => 1,
            'tax_query' => [['taxonomy' => 'wp_theme', 'field' => 'name', 'terms' => $theme]],
        ]);
        $id = $this->upsert($existing[0] ?? null, [
            'post_type' => $type,
            'post_name' => $slug,
            'post_title' => (string) $def['title'],
            'post_excerpt' => (string) ($def['description'] ?? ''),
            'post_content' => $this->render((string) file_get_contents($this->dir . $def['file'])),
            'post_status' => 'publish',
        ], ($type === 'wp_template' ? 'plantilla ' : 'parte ') . $slug, $version, [], true);
        if ($id > 0) {
            wp_set_post_terms($id, [$theme], 'wp_theme');
            if ($type === 'wp_template_part') {
                wp_set_post_terms($id, [(string) ($def['area'] ?? 'uncategorized')], 'wp_template_part_area');
            }
        }
    }

    /**
     * Crea o actualiza un post sin pisar ediciones manuales.
     * @param list<string> $adoptMarkers contenido de terceros que se puede reemplazar (p. ej. páginas de arranque antiguas)
     */
    private function upsert(?\WP_Post $existing, array $postarr, string $label, string $version, array $adoptMarkers = [], bool $adoptAny = false): int
    {
        if ($existing === null) {
            $id = wp_insert_post($postarr, true);
            if (is_wp_error($id)) {
                $this->log[] = "error   {$label}: " . $id->get_error_message();
                return 0;
            }
            $this->stamp($id, $version);
            $this->log[] = "creada  {$label}";

            return $id;
        }

        $id = (int) $existing->ID;
        $hash = (string) get_post_meta($id, self::META_HASH, true);
        $current = md5((string) $existing->post_content);
        if (!$this->force) {
            if ($hash === '') {
                $adoptable = $adoptAny && trim((string) $existing->post_content) === '';
                foreach ($adoptMarkers as $marker) {
                    $adoptable = $adoptable || str_contains((string) $existing->post_content, $marker);
                }
                if (!$adoptable) {
                    $this->log[] = "omitida {$label}: ya existía sin marca del instalador (usa --force para reemplazarla)";
                    return $id;
                }
            } elseif ($hash !== $current) {
                $this->log[] = "omitida {$label}: tiene ediciones manuales";
                return $id;
            }
            if ($hash !== '' && md5((string) $postarr['post_content']) === $hash
                && get_post_meta($id, self::META_VERSION, true) === $version && $existing->post_title === $postarr['post_title']) {
                if (!empty($postarr['meta_input'])) {
                    foreach ($postarr['meta_input'] as $k => $v) {
                        update_post_meta($id, $k, $v);
                    }
                }
                $this->log[] = "igual   {$label}";
                return $id;
            }
        }
        $postarr['ID'] = $id;
        if ($existing->post_status !== 'publish' && $postarr['post_type'] === 'page') {
            $postarr['post_status'] = $existing->post_status; // respeta el flujo editorial en curso
        }
        $result = wp_update_post($postarr, true);
        if (is_wp_error($result)) {
            $this->log[] = "error   {$label}: " . $result->get_error_message();
            return 0;
        }
        $this->stamp($id, $version);
        $this->log[] = "actualizada {$label}";

        return $id;
    }

    private function stamp(int $id, string $version): void
    {
        clean_post_cache($id);
        update_post_meta($id, self::META_VERSION, $version);
        update_post_meta($id, self::META_HASH, md5((string) get_post_field('post_content', $id, 'raw')));
    }

    /** PublishPress Future: pasa la promoción a borrador al cumplirse el plazo. */
    private function scheduleExpiration(int $id, int $days): void
    {
        if (get_post_meta($id, '_expiration-date', true) && !$this->force) {
            return;
        }
        if (!has_action('publishpressfuture_schedule_expiration')) {
            $this->log[] = "aviso   página {$id}: PublishPress Future (post-expirator) no está activo; no se programó la caducidad";
            return;
        }
        $when = time() + $days * DAY_IN_SECONDS;
        do_action('publishpressfuture_schedule_expiration', $id, $when, [
            'expireType' => 'draft', 'newStatus' => 'draft', 'category' => [], 'categoryTaxonomy' => '',
        ]);
        $this->log[] = 'caduca  página ' . $id . ' el ' . wp_date('Y-m-d H:i', $when) . ' (pasa a borrador)';
    }

    private function installOptions(string $version): void
    {
        $done = get_option(self::OPTION);
        $first = !$done || $this->force;
        $site = $this->manifest['site'] ?? [];

        if ($first) {
            foreach (['blogname', 'blogdescription'] as $key) {
                if (!empty($site[$key])) {
                    update_option($key, $site[$key]);
                }
            }
            $this->applyGlobalStyles($this->manifest['styles'] ?? []);
            $this->applyKadencePalette($this->manifest['styles']['palette'] ?? []);
            $this->applyYoast($this->manifest['seo'] ?? []);
            $this->log[] = 'ajustes título del sitio, estilos globales, paleta Kadence y Yoast aplicados';
        } else {
            $this->log[] = 'igual   ajustes del sitio (ya aplicados en ' . $done . '; usa --force para repetir)';
        }

        $front = $this->pageIds[$this->manifest['front_page'] ?? 'inicio'] ?? 0;
        if ($front > 0 && (get_option('show_on_front') !== 'page' || (int) get_option('page_on_front') !== $front)) {
            if ($first || (int) get_option('page_on_front') === 0) {
                update_option('show_on_front', 'page');
                update_option('page_on_front', $front);
                $this->log[] = 'portada página ' . $front;
            }
        }
        if (get_option('permalink_structure') === '') {
            update_option('permalink_structure', '/%postname%/');
            flush_rewrite_rules(false);
            $this->log[] = 'enlaces permanentes /%postname%/';
        }
        update_option(self::OPTION, $version, false);
    }

    private function applyGlobalStyles(array $styles): void
    {
        if (!class_exists('WP_Theme_JSON_Resolver')) {
            return;
        }
        $id = \WP_Theme_JSON_Resolver::get_user_global_styles_post_id();
        if (!$id) {
            return;
        }
        $data = json_decode((string) get_post_field('post_content', $id, 'raw'), true) ?: ['version' => 3, 'isGlobalStylesUserThemeJSON' => true];
        $palette = [];
        foreach ($styles['palette'] ?? [] as $c) {
            $palette[] = ['slug' => $c['slug'], 'name' => $c['name'], 'color' => $c['color']];
        }
        $data['settings']['color']['palette']['custom'] = $palette;
        $data['settings']['typography']['fontFamilies']['custom'] = $styles['fonts'] ?? [];
        $data['styles'] = array_replace_recursive($data['styles'] ?? [], $styles['global'] ?? []);
        wp_update_post(['ID' => $id, 'post_content' => wp_json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)]);
        if (function_exists('wp_clean_theme_json_cache')) {
            wp_clean_theme_json_cache();
        }
    }

    private function applyKadencePalette(array $palette): void
    {
        $items = [];
        foreach ($palette as $c) {
            $items[] = ['color' => $c['color'], 'name' => $c['name'], 'slug' => 'hub-' . $c['slug']];
        }
        update_option('kadence_blocks_colors', wp_json_encode(['palette' => $items, 'override' => false]));
    }

    private function applyYoast(array $seo): void
    {
        foreach ($seo as $option => $values) {
            if (!in_array($option, ['wpseo', 'wpseo_titles', 'wpseo_social'], true) || !is_array($values)) {
                continue;
            }
            $current = get_option($option);
            update_option($option, array_merge(is_array($current) ? $current : [], $values));
        }
    }

    /** Sustituye {{url:slug}}, {{nav:clave}}, {{portal_url}} y {{year}}. */
    private function render(string $html): string
    {
        return (string) preg_replace_callback('/\{\{(url|nav|portal_url|year)(?::([a-z0-9-]+))?\}\}/', function (array $m): string {
            return match ($m[1]) {
                'url' => esc_url($this->url($m[2] ?? '')),
                'nav' => (string) ($this->navIds[$m[2] ?? ''] ?? 0),
                'portal_url' => esc_url(self::portalUrl()),
                'year' => wp_date('Y'),
            };
        }, $html);
    }

    private function url(string $slug): string
    {
        $path = ($slug === '' || $slug === ($this->manifest['front_page'] ?? 'inicio')) ? '/' : '/' . $slug . '/';

        return wp_make_link_relative(home_url($path)) ?: $path;
    }
}
