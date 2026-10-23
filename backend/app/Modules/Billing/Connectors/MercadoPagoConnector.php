<?php

declare(strict_types=1);

namespace App\Modules\Billing\Connectors;

use App\Modules\Billing\Contracts\CardGatewayConnector;
use App\Shared\Http\Problem\ProblemException;
use Illuminate\Http\Client\ConnectionException;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Mercado Pago Checkout Pro (Perú, API v1). Preferencia:
 * POST /checkout/preferences; consulta: GET /v1/payments/{id}; reembolso:
 * POST /v1/payments/{id}/refunds. Webhook: cabecera x-signature
 * "ts=…,v1=…" con HMAC-SHA256 (hex) de la clave secreta sobre el manifest
 * "id:{data.id};request-id:{x-request-id};ts:{ts};" (se omite lo ausente).
 * El access token solo vive en config/env y nunca se registra.
 */
final class MercadoPagoConnector implements CardGatewayConnector
{
    /** @param array<string, mixed> $config hub.billing.card_gateway.mercadopago (+ portal_url) */
    public function __construct(private readonly array $config) {}

    public static function fromConfig(): self
    {
        $config = (array) config('hub.billing.card_gateway.mercadopago', []);
        $config['portal_url'] = (string) config('hub.billing.card_gateway.portal_url', '');

        return new self($config);
    }

    public function isConfigured(): bool
    {
        return $this->str('access_token') !== '' && $this->str('webhook_secret') !== '';
    }

    public function currencies(): array
    {
        $list = $this->config['currencies'] ?? ['PEN'];
        $list = is_string($list) ? explode(',', $list) : (array) $list;

        return array_values(array_unique(array_filter(array_map(fn ($c) => strtoupper(trim((string) $c)), $list))));
    }

    public function sandbox(): bool
    {
        return (bool) ($this->config['sandbox'] ?? true);
    }

    public function createCheckout(string $checkoutId, array $invoiceIds, int $amountMinor, string $currency, string $idempotencyKey, array $context = []): array
    {
        $expires = $context['expires_at'] ?? now()->addHour();
        $return = (string) ($context['return_url'] ?? $this->str('portal_url'));
        $body = [
            'items' => [[
                'id' => $invoiceIds[0] ?? $checkoutId,
                'title' => mb_substr((string) ($context['title'] ?? 'Pago de comprobante'), 0, 250),
                'quantity' => 1,
                'currency_id' => $currency,
                'unit_price' => round($amountMinor / 100, 2),
            ]],
            'external_reference' => (string) ($context['external_reference'] ?? $checkoutId),
            'back_urls' => ['success' => $return, 'pending' => $return, 'failure' => $return],
            'expires' => true,
            'expiration_date_to' => $expires->format('Y-m-d\TH:i:s.vP'),
            'metadata' => ['checkout_id' => $checkoutId],
        ];
        // auto_return exige back_urls.success; con http/localhost MP no redirige solo (queda el botón "Volver al sitio").
        if (str_starts_with($return, 'https://')) {
            $body['auto_return'] = 'approved';
        }
        if (($notification = $this->notificationUrl()) !== null) {
            $body['notification_url'] = $notification;
        }
        if (($descriptor = $this->str('statement_descriptor')) !== '') {
            $body['statement_descriptor'] = mb_substr($descriptor, 0, 22);
        }
        if (! empty($context['payer_email'])) {
            $body['payer'] = ['email' => (string) $context['payer_email']];
        }

        $response = $this->send(fn () => $this->http()->withHeaders(['X-Idempotency-Key' => $idempotencyKey])->post('/checkout/preferences', $body), 'preference');
        $data = (array) $response->json();
        $url = (string) ($this->sandbox() ? ($data['sandbox_init_point'] ?? '') : ($data['init_point'] ?? ''));
        if (! isset($data['id']) || ! str_starts_with($url, 'https://')) {
            throw new ProblemException(502, 'gateway_error', 'Mercado Pago no devolvió el enlace de pago. Intente de nuevo en unos minutos.');
        }

        return ['session_id' => (string) $data['id'], 'redirect_url' => $url, 'expires_at' => $expires->format(DATE_ATOM)];
    }

    public function verifyWebhook(string $rawBody, array $headers): bool
    {
        return $this->verifySignature((string) ($headers['x-signature'] ?? ''), (string) ($headers['x-request-id'] ?? ''), (string) ($headers['data.id'] ?? ''));
    }

    /** Firma válida y dentro de la ventana de tiempo (ts en segundos o milisegundos). */
    public function verifySignature(string $signature, string $requestId, string $dataId, ?int $now = null): bool
    {
        $secret = $this->str('webhook_secret');
        if ($secret === '' || $signature === '') {
            return false;
        }
        $parts = [];
        foreach (explode(',', $signature) as $pair) {
            [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
            $parts[strtolower(trim($k))] = trim($v);
        }
        $ts = $parts['ts'] ?? '';
        $v1 = strtolower($parts['v1'] ?? '');
        if (! ctype_digit($ts) || $v1 === '') {
            return false;
        }
        $seconds = strlen($ts) > 11 ? intdiv((int) $ts, 1000) : (int) $ts;
        if (abs(($now ?? time()) - $seconds) > (int) ($this->config['webhook_tolerance_seconds'] ?? 300)) {
            return false;
        }
        // Ids alfanuméricos van en minúsculas (doc de Orders); los ids de pago son numéricos.
        $dataId = ctype_alnum($dataId) && ! ctype_digit($dataId) ? strtolower($dataId) : $dataId;
        $manifest = ($dataId !== '' ? "id:{$dataId};" : '').($requestId !== '' ? "request-id:{$requestId};" : '')."ts:{$ts};";

        return hash_equals(hash_hmac('sha256', $manifest, $secret), $v1);
    }

    public function getTransaction(string $sessionId): array
    {
        if (preg_match('/^\d{1,20}$/', $sessionId) !== 1) {
            throw ProblemException::validation(['payment_id' => ['Identificador de pago inválido.']]);
        }
        $response = $this->send(fn () => $this->http()->get('/v1/payments/'.$sessionId), 'payment', [404]);
        if ($response->status() === 404) {
            throw new ProblemException(404, 'gateway_payment_not_found', 'Mercado Pago no tiene un pago con ese identificador.');
        }
        $p = (array) $response->json();
        $raw = (string) ($p['status'] ?? '');
        $fee = 0;
        foreach ((array) ($p['fee_details'] ?? []) as $f) {
            if (($f['fee_payer'] ?? 'collector') === 'collector') {
                $fee += (int) round(((float) ($f['amount'] ?? 0)) * 100);
            }
        }

        return [
            'status' => match ($raw) {
                'approved' => 'approved',
                'rejected', 'cancelled' => 'declined',
                'pending', 'in_process', 'authorized', 'in_mediation' => 'pending',
                default => 'other',
            },
            'external_id' => isset($p['id']) ? (string) $p['id'] : null,
            'amount_minor' => (int) round(((float) ($p['transaction_amount'] ?? 0)) * 100),
            'currency' => strtoupper((string) ($p['currency_id'] ?? '')),
            'external_reference' => isset($p['external_reference']) ? (string) $p['external_reference'] : null,
            'status_detail' => isset($p['status_detail']) ? (string) $p['status_detail'] : null,
            'raw_status' => $raw,
            'fee_minor' => $fee,
        ];
    }

    public function refund(string $externalId, int $amountMinor, string $idempotencyKey): array
    {
        $response = $this->send(fn () => $this->http()->withHeaders(['X-Idempotency-Key' => $idempotencyKey])
            ->post('/v1/payments/'.rawurlencode($externalId).'/refunds', ['amount' => round($amountMinor / 100, 2)]), 'refund', [400, 404]);
        $data = (array) $response->json();

        return $response->successful()
            ? ['status' => 'succeeded', 'external_id' => isset($data['id']) ? (string) $data['id'] : null]
            : ['status' => 'failed', 'external_id' => null];
    }

    private function notificationUrl(): ?string
    {
        $url = $this->str('notification_url');
        if ($url === '') {
            $url = rtrim((string) config('app.url'), '/').'/api/v1/webhooks/mercadopago';
        }
        if (! str_starts_with($url, 'https://')) {
            return null; // MP no llega a http/localhost: queda la confirmación por retorno del portal (README).
        }

        return $url.(str_contains($url, '?') ? '&' : '?').'source_news=webhooks';
    }

    private function http(): PendingRequest
    {
        return Http::baseUrl(rtrim($this->str('base_url') ?: 'https://api.mercadopago.com', '/'))
            ->withToken($this->str('access_token'))->acceptJson()->asJson()
            ->timeout((int) ($this->config['timeout'] ?? 15))->connectTimeout(5);
    }

    /** @param list<int> $tolerated estados que interpreta el llamador */
    private function send(callable $call, string $what, array $tolerated = []): Response
    {
        try {
            $response = $call();
        } catch (ConnectionException) {
            Log::warning('mercadopago.unreachable', ['op' => $what]);
            throw new ProblemException(502, 'gateway_unavailable', 'No se pudo conectar con Mercado Pago. Intente de nuevo en unos minutos.');
        }
        if ($response->successful() || in_array($response->status(), $tolerated, true)) {
            return $response;
        }
        // Solo estado y mensaje de MP: nunca cabeceras ni el token.
        Log::warning('mercadopago.error', ['op' => $what, 'status' => $response->status(), 'message' => mb_substr((string) ($response->json('message') ?? ''), 0, 200)]);
        if (in_array($response->status(), [401, 403], true)) {
            throw new ProblemException(502, 'gateway_misconfigured', 'Mercado Pago rechazó las credenciales configuradas.');
        }

        throw new ProblemException(502, 'gateway_error', 'Mercado Pago no pudo procesar la solicitud. Intente de nuevo en unos minutos.');
    }

    private function str(string $key): string
    {
        return trim((string) ($this->config[$key] ?? ''));
    }
}
