<?php

namespace HubConnector;

class Plugin
{
    private static ?Plugin $instance = null;

    public static function getInstance(): Plugin
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    public function boot(): void
    {
        $this->registerShortcodes();
        $this->registerAdminHooks();
        $this->registerRestRoutes();
    }

    private function registerShortcodes(): void
    {
        // [hub_planes tipo="hosting"]
        add_shortcode('hub_planes', [$this, 'renderPlanes']);

        // [hub_whois] Buscador de dominios
        add_shortcode('hub_whois', [$this, 'renderWhois']);

        // [hub_libro_reclamaciones]
        add_shortcode('hub_libro_reclamaciones', [$this, 'renderLibro']);

        // [hub_contacto]
        add_shortcode('hub_contacto', [$this, 'renderContacto']);
    }

    private function registerAdminHooks(): void
    {
        if (is_admin()) {
            add_action('admin_menu', function () {
                add_options_page(
                    'Hub Connector',
                    'Hub Connector',
                    'manage_options',
                    'hub-connector',
                    [$this, 'renderAdminSettings']
                );
            });
        }
    }

    private function registerRestRoutes(): void
    {
        add_action('rest_api_init', function () {
            register_rest_route('hub-connector/v1', '/invalidate', [
                'methods' => 'POST',
                'callback' => [$this, 'handleCacheInvalidation'],
                'permission_callback' => '__return_true',
            ]);
        });
    }

    public function renderPlanes($atts): string
    {
        $settings = get_option('hub_connector_settings', []);
        $hubUrl = rtrim($settings['hub_url'] ?? '', '/');
        $portalUrl = $settings['portal_url'] ?? 'http://localhost:3001';

        $a = shortcode_atts([
            'tipo' => 'hosting',
            'moneda' => 'PEN',
        ], $atts);

        // Si no está configurado, muestra aviso a administradores
        if (empty($hubUrl)) {
            if (current_user_can('edit_posts')) {
                return '<div style="padding:15px;background:#fdebd9;border:1px solid #d9700b;border-radius:6px;color:#9a4b00;"><b>[Hub Connector]</b> Configura la URL del sistema en Ajustes &gt; Hub Connector.</div>';
            }
            return '';
        }

        // Renderizado de tarjetas de planes con enlace directo a apps/portal
        return sprintf(
            '<div class="hub-plans-grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin:24px 0;">
                <div class="hub-plan-card" style="border:1px solid #d9e0ec;border-radius:12px;padding:24px;background:#fff;box-shadow:0 2px 6px rgba(0,0,0,0.04);">
                    <h3 style="margin:0 0 8px;font-size:20px;">Hosting Emprendedor</h3>
                    <p style="color:#5d6b84;font-size:14px;margin:0 0 16px;">Ideal para sitios web corporativos y blogs en WordPress.</p>
                    <div style="font-size:28px;font-weight:700;color:#0a3fc4;margin-bottom:16px;">S/ 35.00 <span style="font-size:14px;color:#5d6b84;font-weight:400;">/mes</span></div>
                    <ul style="padding-left:18px;margin-bottom:24px;font-size:14px;color:#33425c;line-height:1.6;">
                        <li>5 GB SSD NVMe</li>
                        <li>Correos corporativos ilimitados</li>
                        <li>Certificado SSL Gratis</li>
                        <li>Panel cPanel en español</li>
                    </ul>
                    <a href="%s/#checkout?plan=hosting-emprendedor" style="display:block;text-align:center;padding:10px 16px;background:#0a3fc4;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Contratar Plan</a>
                </div>
                <div class="hub-plan-card" style="border:2px solid #0a3fc4;border-radius:12px;padding:24px;background:#fff;box-shadow:0 6px 18px rgba(10,63,196,0.12);position:relative;">
                    <span style="position:absolute;top:-12px;right:20px;background:#0a3fc4;color:#fff;font-size:11px;font-weight:700;padding:4px 10px;border-radius:12px;">MÁS POPULAR</span>
                    <h3 style="margin:0 0 8px;font-size:20px;">Hosting Pro Cloud</h3>
                    <p style="color:#5d6b84;font-size:14px;margin:0 0 16px;">Para tiendas virtuales, alto tráfico y sitios exigentes.</p>
                    <div style="font-size:28px;font-weight:700;color:#0a3fc4;margin-bottom:16px;">S/ 85.00 <span style="font-size:14px;color:#5d6b84;font-weight:400;">/mes</span></div>
                    <ul style="padding-left:18px;margin-bottom:24px;font-size:14px;color:#33425c;line-height:1.6;">
                        <li>20 GB SSD NVMe de alta velocidad</li>
                        <li>2 GB RAM dedicada</li>
                        <li>Copias de seguridad diarias</li>
                        <li>Soporte prioritario 24/7</li>
                    </ul>
                    <a href="%s/#checkout?plan=hosting-pro" style="display:block;text-align:center;padding:10px 16px;background:#0a3fc4;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">Contratar Plan</a>
                </div>
            </div>',
            esc_url($portalUrl),
            esc_url($portalUrl)
        );
    }

    public function renderWhois(): string
    {
        return '
        <div class="hub-whois-box" style="padding:24px;background:#f6f8fc;border-radius:12px;border:1px solid #d9e0ec;margin:24px 0;">
            <h3 style="margin:0 0 8px;">Encuentra el dominio para tu proyecto</h3>
            <p style="color:#5d6b84;font-size:14px;margin:0 0 16px;">Verifica disponibilidad de dominios .pe, .com, .net al instante.</p>
            <form style="display:flex;gap:10px;flex-wrap:wrap;">
                <input type="text" placeholder="Escribe tu dominio (ej: miempresa.pe)" style="flex:1;min-width:240px;height:42px;padding:0 14px;border:1px solid #b8c3d6;border-radius:8px;font-size:14px;" required>
                <button type="submit" style="height:42px;padding:0 20px;background:#0a3fc4;color:#fff;border:0;border-radius:8px;font-weight:600;cursor:pointer;">Buscar Dominio</button>
            </form>
        </div>';
    }

    public function renderLibro(): string
    {
        return '
        <div class="hub-complaints-box" style="padding:28px;background:#fff;border-radius:12px;border:1px solid #d9e0ec;max-width:760px;margin:24px auto;">
            <h2 style="margin:0 0 6px;">Libro de Reclamaciones Virtual</h2>
            <p style="color:#5d6b84;font-size:13.5px;margin:0 0 20px;">Conforme a lo establecido en el Código de Protección y Defensa del Consumidor (Ley N° 29571).</p>
            <p style="font-size:14px;color:#33425c;">Las hojas de reclamación enviadas se derivan automáticamente a la mesa de control legal y se responden dentro de los 15 días hábiles conforme a ley.</p>
        </div>';
    }

    public function renderContacto(): string
    {
        return '<p>Teléfono: +51 984 512 337 | Correo: contacto@alojamientoplus.pe</p>';
    }

    public function handleCacheInvalidation(\WP_REST_Request $request): \WP_REST_Response
    {
        // Invalida cachés del catálogo cuando el backend hace cambios
        delete_transient('hub_catalog_cache');
        return new \WP_REST_Response(['status' => 'cache_invalidated', 'time' => time()], 200);
    }

    public function renderAdminSettings(): void
    {
        if (!current_user_can('manage_options')) {
            return;
        }

        if (isset($_POST['hub_save_settings'])) {
            check_admin_referer('hub_save_settings_verify');
            $settings = [
                'hub_url' => esc_url_raw($_POST['hub_url'] ?? ''),
                'portal_url' => esc_url_raw($_POST['portal_url'] ?? ''),
                'api_token' => sanitize_text_field($_POST['api_token'] ?? ''),
            ];
            update_option('hub_connector_settings', $settings);
            echo '<div class="updated"><p>Configuración guardada correctamente.</p></div>';
        }

        $settings = get_option('hub_connector_settings', []);
        $hubUrl = esc_attr($settings['hub_url'] ?? 'http://localhost:8080');
        $portalUrl = esc_attr($settings['portal_url'] ?? 'http://localhost:3001');
        $apiToken = esc_attr($settings['api_token'] ?? '');

        echo '<div class="wrap">';
        echo '<h1>Hub Connector — Conexión con el Sistema Central</h1>';
        echo '<form method="post">';
        wp_nonce_field('hub_save_settings_verify');
        echo '<table class="form-table">';
        echo '<tr><th><label for="hub_url">URL de la API Hub (Backend)</label></th><td><input type="url" name="hub_url" id="hub_url" value="' . $hubUrl . '" class="regular-text"><p class="description">Ejemplo: https://api.alojamientoplus.pe o http://localhost:8080</p></td></tr>';
        echo '<tr><th><label for="portal_url">URL del Portal de Clientes (Frontend React)</label></th><td><input type="url" name="portal_url" id="portal_url" value="' . $portalUrl . '" class="regular-text"><p class="description">URL donde el cliente completa la compra y gestiona sus servicios.</p></td></tr>';
        echo '<tr><th><label for="api_token">Token del Sitio (Solo Lectura)</label></th><td><input type="password" name="api_token" id="api_token" value="' . $apiToken . '" class="regular-text"></td></tr>';
        echo '</table>';
        echo '<p><input type="submit" name="hub_save_settings" class="button button-primary" value="Guardar Cambios"></p>';
        echo '</form>';
        echo '</div>';
    }
}
