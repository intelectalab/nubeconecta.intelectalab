<?php

namespace HubConnector\Rest;

use HubConnector\Cache\CacheStore;
use HubConnector\Cache\PageCachePurger;
use HubConnector\Security\SignatureVerifier;
use HubConnector\Settings;

/**
 * POST /wp-json/hub-connector/v1/invalidate (docs/13 §6). Ruta pública: la
 * autenticación es la firma X-Hub-Signature. Orden: cuerpo crudo → firma (actual
 * o anterior) → ventana de 5 min → event_id repetido → marca del sitio.
 */
final class InvalidateController
{
    public const SCOPES = ['catalog', 'plan', 'bundle', 'domain_prices', 'promotion', 'contact', 'legal_document', 'form', 'service_status', 'all'];
    private const MAX_BODY = 65536;
    private const SEEN = 'hubc_seen_events';

    public function __construct(
        private Settings $settings,
        private CacheStore $cache,
        private SignatureVerifier $verifier,
        private PageCachePurger $purger,
    ) {
    }

    public function handle(\WP_REST_Request $request): \WP_REST_Response
    {
        $raw = (string) $request->get_body();
        if ($raw === '' || strlen($raw) > self::MAX_BODY) {
            return new \WP_REST_Response(['error' => 'invalid_body'], 400);
        }

        $check = $this->verifier->verify((string) $request->get_header('x_hub_signature'), $raw, $this->settings->webhookSecrets(), time());
        if ($check !== 'ok') {
            return new \WP_REST_Response(['error' => $check], 401);
        }

        $body = json_decode($raw, true);
        $scope = is_array($body) ? ($body['scope'] ?? null) : null;
        if (!is_array($body) || !is_string($body['event_id'] ?? null) || $body['event_id'] === '' || !in_array($scope, self::SCOPES, true)
            || (isset($body['keys']) && !is_array($body['keys']))) {
            return new \WP_REST_Response(['error' => 'invalid_body'], 400);
        }

        $seen = get_transient(self::SEEN);
        $seen = is_array($seen) ? $seen : [];
        if (in_array($body['event_id'], $seen, true)) {
            return new \WP_REST_Response(['status' => 'duplicate'], 200);
        }

        $brand = $this->settings->brand();
        if ($brand === '' || (string) ($body['brand'] ?? '') !== $brand) {
            return new \WP_REST_Response(['error' => 'brand_mismatch'], 409);
        }

        $seen[] = $body['event_id'];
        set_transient(self::SEEN, array_slice($seen, -500), DAY_IN_SECONDS);

        $keys = array_values(array_filter(array_map(static fn ($k) => is_scalar($k) ? (string) $k : '', $body['keys'] ?? []), 'strlen'));
        $deleted = $this->cache->invalidate($scope, $keys);
        do_action('hub_connector_cache_invalidated', $scope, $keys);
        $this->purger->purge();

        return new \WP_REST_Response(['status' => 'processed', 'deleted' => $deleted], 200);
    }
}
