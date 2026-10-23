<?php

namespace HubConnector;

use HubConnector\Security\SecretBox;

/**
 * Ajustes por sitio (opción hub_connector_settings, docs/13 §4). El token y los
 * secretos se guardan cifrados con SecretBox y nunca salen de aquí en claro
 * hacia HTML, JS, logs ni respuestas REST.
 */
final class Settings
{
    public const OPTION = 'hub_connector_settings';
    public const NETWORK_OPTION = 'hub_connector_network';
    private const ENCRYPTED = ['token', 'webhook_secret', 'previous_webhook_secret'];

    /** @var array<string, string> */
    private array $plain = [];

    public function __construct(private SecretBox $box)
    {
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $value = get_option(self::OPTION, []);

        return is_array($value) ? $value : [];
    }

    public function hubUrl(): string
    {
        $url = (string) ($this->all()['hub_url'] ?? '');
        if ($url === '' && function_exists('get_site_option')) {
            $network = get_site_option(self::NETWORK_OPTION, []);
            $url = is_array($network) ? (string) ($network['hub_url'] ?? '') : '';
        }

        return rtrim($url, '/');
    }

    /** Base de la API: la URL del sistema más /api/v1 (si no lo trae ya). */
    public function apiBase(): string
    {
        $url = $this->hubUrl();
        if ($url === '') {
            return '';
        }

        return preg_match('#/api/v1$#', $url) ? $url : $url . '/api/v1';
    }

    public function brand(): string
    {
        return (string) ($this->all()['brand'] ?? '');
    }

    public function token(): string
    {
        return $this->secret('token');
    }

    /** @return list<string> */
    public function webhookSecrets(): array
    {
        return array_values(array_filter([$this->secret('webhook_secret'), $this->secret('previous_webhook_secret')]));
    }

    public function hasSecret(string $key): bool
    {
        return (string) ($this->all()[$key] ?? '') !== '';
    }

    public function tokenLast4(): string
    {
        return (string) ($this->all()['token_last4'] ?? '');
    }

    public function submissionMode(): string
    {
        $mode = (string) ($this->all()['submission_mode'] ?? '');

        return in_array($mode, ['direct', 'relay'], true) ? $mode : 'direct';
    }

    public function loadDefaultCss(): bool
    {
        return (bool) ($this->all()['load_default_css'] ?? true);
    }

    public function defaultCurrency(): string
    {
        $currency = (string) ($this->all()['default_currency'] ?? '');

        return in_array($currency, ['PEN', 'USD'], true) ? $currency : '';
    }

    public function isConnected(): bool
    {
        return $this->apiBase() !== '' && $this->token() !== '';
    }

    /** Idioma de los datos: es o en según el idioma del sitio (docs/13 §12). */
    public function lang(): string
    {
        $locale = function_exists('determine_locale') ? determine_locale() : (function_exists('get_locale') ? get_locale() : 'es_ES');

        return strncmp((string) $locale, 'en', 2) === 0 ? 'en' : 'es';
    }

    /** Huella corta de URL + token: separa la caché si cambia la conexión. */
    public function fingerprint(): string
    {
        return substr(hash('sha256', $this->apiBase() . '|' . $this->token()), 0, 10);
    }

    /** @return list<string> claves guardadas que ya no se pueden descifrar (cambiaron las sales) */
    public function undecryptable(): array
    {
        $bad = [];
        foreach (self::ENCRYPTED as $key) {
            $stored = (string) ($this->all()[$key] ?? '');
            if ($stored !== '' && $this->box->decrypt($stored) === null) {
                $bad[] = $key;
            }
        }

        return $bad;
    }

    /**
     * Guarda los ajustes del formulario. Los campos secretos vacíos conservan lo guardado.
     *
     * @param array<string, mixed> $input valores ya sin barras (wp_unslash)
     * @return list<string> errores para el administrador
     */
    public function save(array $input): array
    {
        $errors = [];
        $next = $this->all();

        $url = trim((string) ($input['hub_url'] ?? ''));
        if ($url === '') {
            $next['hub_url'] = '';
        } elseif (!self::acceptableUrl($url)) {
            $errors[] = __('La URL del sistema debe usar HTTPS.', 'hub-connector');
        } else {
            $next['hub_url'] = esc_url_raw($url, ['https', 'http']);
        }

        $brand = strtolower(trim((string) ($input['brand'] ?? '')));
        if ($brand !== '' && !preg_match('/^[a-z0-9_-]{1,40}$/', $brand)) {
            $errors[] = __('El código de marca solo admite letras minúsculas, números, guion y guion bajo.', 'hub-connector');
        } else {
            $next['brand'] = $brand;
        }

        foreach (self::ENCRYPTED as $key) {
            $value = trim((string) ($input[$key] ?? ''));
            if ($value === '') {
                continue;
            }
            if (strlen($value) > 512 || preg_match('/\s/', $value)) {
                $errors[] = sprintf(__('El valor de %s no es válido.', 'hub-connector'), $key);
                continue;
            }
            $next[$key] = $this->box->encrypt($value);
            if ($key === 'token') {
                $next['token_last4'] = substr($value, -4);
            }
        }
        if (!empty($input['clear_previous_webhook_secret'])) {
            $next['previous_webhook_secret'] = '';
        }

        $mode = (string) ($input['submission_mode'] ?? 'direct');
        $next['submission_mode'] = in_array($mode, ['direct', 'relay'], true) ? $mode : 'direct';
        $next['load_default_css'] = !empty($input['load_default_css']);
        $currency = (string) ($input['default_currency'] ?? '');
        $next['default_currency'] = in_array($currency, ['PEN', 'USD'], true) ? $currency : '';

        unset($next['api_token'], $next['portal_url']);
        update_option(self::OPTION, $next, false);
        $this->plain = [];

        return $errors;
    }

    /** Cifra los valores que versiones anteriores del plugin guardaban en claro. */
    public function migrateLegacy(): void
    {
        $settings = $this->all();
        $changed = false;
        if (!empty($settings['api_token']) && empty($settings['token'])) {
            $settings['token'] = (string) $settings['api_token'];
            $settings['token_last4'] = substr((string) $settings['api_token'], -4);
        }
        foreach (self::ENCRYPTED as $key) {
            $value = (string) ($settings[$key] ?? '');
            if ($value !== '' && !SecretBox::isEncrypted($value)) {
                $settings[$key] = $this->box->encrypt($value);
                $changed = true;
            }
        }
        if (array_key_exists('api_token', $settings) || array_key_exists('portal_url', $settings)) {
            unset($settings['api_token'], $settings['portal_url']);
            $changed = true;
        }
        if ($changed) {
            update_option(self::OPTION, $settings, false);
            $this->plain = [];
        }
    }

    /** HTTPS obligatorio; HTTP solo en entornos local o de desarrollo. */
    public static function acceptableUrl(string $url): bool
    {
        $scheme = strtolower((string) parse_url($url, PHP_URL_SCHEME));
        if ((string) parse_url($url, PHP_URL_HOST) === '') {
            return false;
        }
        if ($scheme === 'https') {
            return true;
        }
        $env = function_exists('wp_get_environment_type') ? wp_get_environment_type() : 'production';

        return $scheme === 'http' && in_array($env, ['local', 'development'], true);
    }

    private function secret(string $key): string
    {
        if (!array_key_exists($key, $this->plain)) {
            $stored = (string) ($this->all()[$key] ?? '');
            $this->plain[$key] = $stored === '' ? '' : (string) $this->box->decrypt($stored);
        }

        return $this->plain[$key];
    }
}
