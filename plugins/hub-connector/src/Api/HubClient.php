<?php

namespace HubConnector\Api;

use HubConnector\Settings;

/**
 * Cliente HTTP del sistema (docs/13 §5). Lecturas solo desde el servidor de
 * WordPress con el token del sitio (Authorization: Bearer, middleware wp.site
 * del sistema), X-Hub-Plugin-Version, Accept-Language y User-Agent; tiempo de
 * espera corto, sin reintentos, sin redirecciones y con sslverify siempre activo.
 */
class HubClient
{
    public function __construct(private Settings $settings)
    {
    }

    /**
     * @param array<string, scalar> $query
     * @return array{status:int, data?:mixed, etag?:string, error?:string, retry_after?:int}
     */
    public function get(string $path, array $query = [], ?string $etag = null): array
    {
        $base = $this->settings->apiBase();
        $token = $this->settings->token();
        if ($base === '' || $token === '') {
            return ['status' => 0, 'error' => 'not_configured'];
        }

        $url = $base . $path;
        if ($query !== []) {
            ksort($query);
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }

        $headers = [
            'Authorization' => 'Bearer ' . $token,
            'Accept' => 'application/json',
            'Accept-Language' => $this->settings->lang(),
            'X-Hub-Plugin-Version' => HUB_CONNECTOR_VERSION,
        ];
        if ($etag !== null && $etag !== '') {
            $headers['If-None-Match'] = $etag;
        }

        $response = wp_remote_get($url, [
            'timeout' => (float) apply_filters('hub_connector_http_timeout', 5),
            'redirection' => 0,
            'sslverify' => true,
            'headers' => $headers,
            'user-agent' => sprintf('HubConnector/%s; WordPress/%s; %s', HUB_CONNECTOR_VERSION, get_bloginfo('version'), home_url('/')),
        ]);

        if (is_wp_error($response)) {
            return ['status' => 0, 'error' => 'unreachable'];
        }

        $status = (int) wp_remote_retrieve_response_code($response);
        if ($status === 304) {
            return ['status' => 304];
        }

        $json = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status === 200) {
            if (!is_array($json) || !array_key_exists('data', $json)) {
                return ['status' => 502, 'error' => 'invalid_response'];
            }

            return ['status' => 200, 'data' => $json['data'], 'etag' => (string) wp_remote_retrieve_header($response, 'etag')];
        }

        return $this->failure($status, $json, $response);
    }

    /**
     * Envío (formularios en modo reenvío, docs/13 §9): mismo token y cabeceras que las
     * lecturas, más Idempotency-Key y X-Hub-Visitor-Ip. No guarda nada ni reintenta.
     *
     * @param array<string, mixed> $body
     * @param array<string, string> $headers
     * @return array{status:int, data?:mixed, errors?:array, error?:string, retry_after?:int}
     */
    public function post(string $path, array $body, array $headers = []): array
    {
        $base = $this->settings->apiBase();
        $token = $this->settings->token();
        if ($base === '' || $token === '') {
            return ['status' => 0, 'error' => 'not_configured'];
        }
        $response = wp_remote_post($base . $path, [
            'timeout' => (float) apply_filters('hub_connector_http_timeout', 8),
            'redirection' => 0,
            'sslverify' => true,
            'headers' => $headers + [
                'Authorization' => 'Bearer ' . $token,
                'Accept' => 'application/json',
                'Content-Type' => 'application/json',
                'Accept-Language' => $this->settings->lang(),
                'X-Hub-Plugin-Version' => HUB_CONNECTOR_VERSION,
            ],
            'body' => (string) wp_json_encode($body),
            'user-agent' => sprintf('HubConnector/%s; WordPress/%s; %s', HUB_CONNECTOR_VERSION, get_bloginfo('version'), home_url('/')),
        ]);
        if (is_wp_error($response)) {
            return ['status' => 0, 'error' => 'unreachable'];
        }
        $status = (int) wp_remote_retrieve_response_code($response);
        $json = json_decode((string) wp_remote_retrieve_body($response), true);
        if ($status >= 200 && $status < 300) {
            return ['status' => $status, 'data' => is_array($json) ? ($json['data'] ?? null) : null];
        }

        return $this->failure($status, $json, $response);
    }

    /** @param mixed $response */
    private function failure(int $status, mixed $json, $response): array
    {
        $result = ['status' => $status, 'error' => is_array($json) && is_string($json['code'] ?? null) ? $json['code'] : 'http_' . $status];
        if (is_array($json) && is_array($json['errors'] ?? null)) {
            $result['errors'] = $json['errors'];
        }
        $retry = wp_remote_retrieve_header($response, 'retry-after');
        if (is_numeric($retry)) {
            $result['retry_after'] = max(1, (int) $retry);
        }

        return $result;
    }
}
