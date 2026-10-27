<?php

namespace HubConnector;

use HubConnector\Admin\Notices;
use HubConnector\Admin\SettingsPage;
use HubConnector\Api\HubClient;
use HubConnector\Cache\CacheStore;
use HubConnector\Cache\PageCachePurger;
use HubConnector\Render\Templates;
use HubConnector\Rest\FormRelayController;
use HubConnector\Rest\InvalidateController;
use HubConnector\Security\SecretBox;
use HubConnector\Security\SignatureVerifier;
use HubConnector\Shortcodes\AbstractShortcode;
use HubConnector\Shortcodes\BotonContratarShortcode;
use HubConnector\Shortcodes\ComparadorShortcode;
use HubConnector\Shortcodes\ContactoShortcode;
use HubConnector\Shortcodes\FormularioShortcode;
use HubConnector\Shortcodes\LegalShortcode;
use HubConnector\Shortcodes\PendingShortcode;
use HubConnector\Shortcodes\PlanesShortcode;
use HubConnector\Shortcodes\PlanShortcode;
use HubConnector\Shortcodes\PreciosDominiosShortcode;
use HubConnector\Shortcodes\SelectorMonedaShortcode;

/** Registra servicios y hooks (docs/13 §3). */
class Plugin
{
    private static ?Plugin $instance = null;

    private Settings $settings;
    private CacheStore $cache;
    private Templates $templates;
    private HubClient $client;

    public static function getInstance(): Plugin
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }

        return self::$instance;
    }

    /** Solo para pruebas: inyecta servicios simulados. */
    public static function setInstance(?Plugin $plugin): void
    {
        self::$instance = $plugin;
    }

    public function __construct(?Settings $settings = null, ?CacheStore $cache = null, ?Templates $templates = null, ?HubClient $client = null)
    {
        $this->settings = $settings ?? new Settings(SecretBox::fromWordPress());
        $this->client = $client ?? new HubClient($this->settings);
        $this->cache = $cache ?? new CacheStore($this->client, $this->settings);
        $this->templates = $templates ?? new Templates(HUB_CONNECTOR_PLUGIN_DIR . 'templates/');
    }

    public function settings(): Settings
    {
        return $this->settings;
    }

    public function cache(): CacheStore
    {
        return $this->cache;
    }

    public function templates(): Templates
    {
        return $this->templates;
    }

    public function client(): HubClient
    {
        return $this->client;
    }

    public function boot(): void
    {
        SiteInstaller::registerFrontend();
        if (defined('WP_CLI') && WP_CLI && class_exists('WP_CLI')) {
            \WP_CLI::add_command('hub-connector', Cli\SiteCommand::class);
        }

        add_action('init', function (): void {
            load_plugin_textdomain('hub-connector', false, dirname(plugin_basename(HUB_CONNECTOR_PLUGIN_FILE)) . '/languages');
            // La versión lleva la fecha del archivo para que un cambio de CSS o JS no quede tapado por la caché del navegador.
            $assetVersion = static fn (string $file): string => HUB_CONNECTOR_VERSION . '.' . (int) @filemtime(HUB_CONNECTOR_PLUGIN_DIR . 'assets/' . $file);
            wp_register_style('hub-connector', HUB_CONNECTOR_PLUGIN_URL . 'assets/hub-connector.css', [], $assetVersion('hub-connector.css'));
            wp_register_script('hub-connector', HUB_CONNECTOR_PLUGIN_URL . 'assets/hub-connector.js', [], $assetVersion('hub-connector.js'), ['in_footer' => true, 'strategy' => 'defer']);
            foreach ($this->shortcodes() as $shortcode) {
                add_shortcode($shortcode->tag(), [$shortcode, 'handle']);
            }
        });

        add_action('rest_api_init', function (): void {
            $controller = new InvalidateController($this->settings, $this->cache, new SignatureVerifier(), new PageCachePurger());
            register_rest_route('hub-connector/v1', '/invalidate', [
                'methods' => 'POST',
                'callback' => [$controller, 'handle'],
                'permission_callback' => '__return_true', // la autenticación es la firma X-Hub-Signature
            ]);
            // Reenvío de [hub_formulario]: público con nonce (lo verifica el controlador); no guarda nada.
            register_rest_route('hub-connector/v1', '/relay/form/(?P<code>[a-z0-9]+(?:-[a-z0-9]+)*)', [
                'methods' => 'POST',
                'callback' => [new FormRelayController($this->client), 'handle'],
                'permission_callback' => '__return_true',
            ]);
        });

        if (is_admin()) {
            (new SettingsPage($this))->register();
            (new Notices($this))->register();
            add_action('admin_init', fn () => $this->settings->migrateLegacy());
        }
    }

    /** @return list<AbstractShortcode> */
    public function shortcodes(): array
    {
        $list = [
            new PlanesShortcode($this),
            new PlanShortcode($this),
            new BotonContratarShortcode($this),
            new ContactoShortcode($this),
            new SelectorMonedaShortcode($this),
            new ComparadorShortcode($this),
            new PreciosDominiosShortcode($this),
            new PreciosDominiosShortcode($this, 'hub_dominios'),
            new FormularioShortcode($this),
            new LegalShortcode($this),
            new LegalShortcode($this, 'hub_documento_legal'),
        ];
        foreach (PendingShortcode::TAGS as $tag) {
            $list[] = new PendingShortcode($this, $tag);
        }

        return $list;
    }

    /** Encola el CSS (si el sitio no lo desactivó) y el JS solo en páginas con shortcodes. */
    public function enqueueAssets(): void
    {
        static $done = false;
        if ($done || !function_exists('wp_enqueue_style')) {
            return;
        }
        $done = true;
        if ($this->settings->loadDefaultCss()) {
            wp_enqueue_style('hub-connector');
            $tokens = $this->brandTokensCss();
            if ($tokens !== '') {
                wp_add_inline_style('hub-connector', $tokens);
            }
        }
        wp_enqueue_script('hub-connector');
    }

    /**
     * Tokens del tema de marca, si GET /public/wp/site los entrega en theme.tokens
     * (hoy el sistema no los envía: queda pendiente). Solo nombres y valores seguros.
     */
    public function brandTokensCss(): string
    {
        $site = $this->cache->peekStale(Api\Endpoints::SITE);
        $tokens = is_array($site['theme']['tokens'] ?? null) ? $site['theme']['tokens'] : [];
        $allowed = ['primary', 'primary-contrast', 'surface', 'border', 'muted', 'radius'];
        $css = '';
        foreach ($tokens as $name => $value) {
            if (in_array($name, $allowed, true) && is_string($value) && preg_match('/^(#[0-9a-fA-F]{3,8}|\d{1,3}(\.\d+)?(px|rem|em)|(rgb|hsl)a?\([0-9.,%\s]{1,40}\))$/', $value)) {
                $css .= '--hub-' . $name . ':' . $value . ';';
            }
        }

        return $css === '' ? '' : '.hub-connector{' . $css . '}';
    }
}
