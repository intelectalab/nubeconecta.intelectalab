<?php

namespace HubConnector\Rest;

use HubConnector\Api\Endpoints;
use HubConnector\Api\HubClient;
use HubConnector\Shortcodes\PreciosDominiosShortcode;

/**
 * Disponibilidad de [hub_precios_dominios vista="buscador"] (D-35):
 * GET /wp-json/hub-connector/v1/domains/availability?name=&tlds= con nonce hub_connector_domains
 * (cabecera X-Hub-Domain-Nonce). La consulta se hace desde el navegador, así la página sigue
 * siendo cacheable; esta ruta llama al sistema con el token del sitio y la IP del visitante
 * (X-Hub-Visitor-Ip) y no guarda nada: ni transients ni opciones.
 */
final class DomainAvailabilityController
{
    private const MAX_TLDS = 8;

    public function __construct(private HubClient $client)
    {
    }

    /** @param \WP_REST_Request $request */
    public function handle($request)
    {
        $nonce = (string) ($request->get_header('x_hub_domain_nonce') ?? '');
        if ($nonce === '' || !wp_verify_nonce($nonce, 'hub_connector_domains')) {
            return self::respond(['code' => 'invalid_nonce', 'message' => __('La página caducó. Recárgala e inténtalo de nuevo.', 'hub-connector')], 403);
        }
        $raw = $request->get_param('name');
        $name = is_string($raw) ? PreciosDominiosShortcode::domainName($raw) : '';
        if ($name === '') {
            return self::respond(['code' => 'validation_failed', 'message' => __('Escribe un nombre con letras, números o guiones, sin espacios.', 'hub-connector')], 422);
        }
        $tlds = [];
        $list = $request->get_param('tlds');
        foreach (is_string($list) ? explode(',', $list) : [] as $item) {
            $tld = ltrim(trim($item), '.');
            if (preg_match('/^[a-z0-9-]{1,30}(\.[a-z0-9-]{1,30}){0,2}$/', $tld) && !in_array($tld, $tlds, true)) {
                $tlds[] = $tld;
            }
        }
        if ($tlds === [] || count($tlds) > self::MAX_TLDS) {
            return self::respond(['code' => 'validation_failed', 'message' => __('Extensiones no válidas.', 'hub-connector')], 422);
        }

        $response = $this->client->get(Endpoints::DOMAIN_AVAILABILITY, ['name' => $name, 'tlds' => implode(',', $tlds)], null, ['X-Hub-Visitor-Ip' => FormRelayController::visitorIp()], 15);
        $status = (int) $response['status'];
        if ($status === 200 && is_array($response['data'] ?? null)) {
            $results = [];
            foreach ((array) ($response['data']['results'] ?? []) as $row) {
                if (is_array($row) && is_string($row['tld'] ?? null) && in_array($row['status'] ?? null, ['available', 'registered', 'unknown'], true)) {
                    $results[] = ['tld' => $row['tld'], 'domain' => (string) ($row['domain'] ?? ''), 'status' => $row['status'], 'allows_transfer_in' => !empty($row['allows_transfer_in'])];
                }
            }

            return self::respond(['name' => $name, 'results' => $results], 200);
        }
        if ($status === 429) {
            return self::respond(['code' => 'rate_limited', 'message' => __('Hiciste muchas consultas seguidas. Intenta de nuevo en unos minutos.', 'hub-connector')], 429);
        }
        if ($status === 422) {
            return self::respond(['code' => 'validation_failed', 'message' => __('Revisa el nombre escrito.', 'hub-connector')], 422);
        }

        return self::respond(['code' => 'unavailable', 'message' => __('No pudimos comprobar la disponibilidad ahora.', 'hub-connector')], 503);
    }

    /** @param array<string, mixed> $data */
    private static function respond(array $data, int $status)
    {
        $response = new \WP_REST_Response($data, $status);
        $response->header('Cache-Control', 'no-store');

        return $response;
    }
}
