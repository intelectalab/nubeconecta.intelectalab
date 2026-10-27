<?php

namespace HubConnector\Rest;

use HubConnector\Api\Endpoints;
use HubConnector\Api\HubClient;

/**
 * Reenvío de [hub_formulario] (docs/13 §9, modo relay):
 * POST /wp-json/hub-connector/v1/relay/form/{code} con nonce hub_connector_form.
 * Pasa los campos al sistema en la misma petición con el token del sitio, la
 * Idempotency-Key del navegador y la IP del visitante (X-Hub-Visitor-Ip).
 * No guarda nada: ni en la base, ni en transients, ni en logs.
 */
final class FormRelayController
{
    private const FIELDS = ['name', 'email', 'phone', 'company', 'message', 'source', 'website', 'page_url', 'captcha_token'];

    public function __construct(private HubClient $client)
    {
    }

    /** @param \WP_REST_Request $request */
    public function handle($request)
    {
        $nonce = (string) ($request->get_header('x_hub_form_nonce') ?? '');
        if ($nonce === '' || !wp_verify_nonce($nonce, 'hub_connector_form')) {
            return new \WP_REST_Response(['code' => 'invalid_nonce', 'message' => __('La página caducó. Recárgala e inténtalo de nuevo.', 'hub-connector')], 403);
        }
        $code = (string) $request->get_param('code');
        if (!preg_match('/^[a-z0-9]+(-[a-z0-9]+)*$/', $code) || strlen($code) > 80) {
            return new \WP_REST_Response(['code' => 'not_found'], 404);
        }
        $raw = $request->get_body();
        if (strlen((string) $raw) > 20000) {
            return new \WP_REST_Response(['code' => 'payload_too_large'], 413);
        }
        $input = json_decode((string) $raw, true);
        if (!is_array($input)) {
            return new \WP_REST_Response(['code' => 'bad_request'], 400);
        }

        $body = [];
        foreach (self::FIELDS as $field) {
            if (isset($input[$field]) && is_scalar($input[$field])) {
                $body[$field] = $field === 'message' ? sanitize_textarea_field((string) $input[$field]) : sanitize_text_field((string) $input[$field]);
            }
        }
        $body['consent'] = !empty($input['consent']);
        if (is_array($input['utm'] ?? null)) {
            foreach (['source', 'medium', 'campaign', 'term', 'content'] as $key) {
                if (isset($input['utm'][$key]) && is_scalar($input['utm'][$key])) {
                    $body['utm'][$key] = substr(sanitize_text_field((string) $input['utm'][$key]), 0, 120);
                }
            }
        }

        $headers = ['X-Hub-Visitor-Ip' => self::visitorIp()];
        $key = (string) ($request->get_header('idempotency_key') ?? '');
        if (preg_match('/^[A-Za-z0-9_.:-]{8,200}$/', $key)) {
            $headers['Idempotency-Key'] = $key;
        }

        $response = $this->client->post(Endpoints::formSubmissions($code), $body, $headers);
        $status = (int) $response['status'];
        if ($status === 202 || $status === 200 || $status === 201) {
            $data = is_array($response['data'] ?? null) ? $response['data'] : [];

            return new \WP_REST_Response(['ok' => true, 'message' => is_string($data['message'] ?? null) ? $data['message'] : null, 'redirect_url' => is_string($data['redirect_url'] ?? null) ? $data['redirect_url'] : null], 202);
        }
        if ($status === 422) {
            $errors = [];
            foreach ((array) ($response['errors'] ?? []) as $field => $messages) {
                if (in_array($field, self::FIELDS, true) || $field === 'consent') {
                    $errors[$field] = is_array($messages) ? array_values(array_map('strval', $messages)) : [(string) $messages];
                }
            }

            return new \WP_REST_Response(['code' => 'validation_failed', 'errors' => $errors], 422);
        }
        if ($status === 429) {
            return new \WP_REST_Response(['code' => 'rate_limited', 'message' => __('Intenta de nuevo en unos minutos.', 'hub-connector')], 429);
        }
        if ($status === 404) {
            return new \WP_REST_Response(['code' => 'not_found'], 404);
        }

        // Sistema caído, token inválido u otro error: mensaje amable, sin detalles técnicos.
        return new \WP_REST_Response(['code' => 'unavailable', 'message' => __('No pudimos enviar tu mensaje. Inténtalo más tarde o escríbenos por los medios de contacto.', 'hub-connector')], 503);
    }

    /** IP del visitante; detrás de un proxy de confianza, el sitio la ajusta con el filtro hub_connector_visitor_ip. */
    public static function visitorIp(): string
    {
        $ip = (string) apply_filters('hub_connector_visitor_ip', (string) ($_SERVER['REMOTE_ADDR'] ?? ''));

        return filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : '';
    }
}
