<?php

declare(strict_types=1);

namespace App\Modules\Billing\Http\Controllers;

use App\Modules\Billing\Contracts\CardGatewayConnector;
use App\Modules\Billing\Services\CardPaymentService;
use App\Shared\Http\Problem\ProblemException;
use App\Shared\Organization\CurrentOrganization;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

/**
 * Webhook público de Mercado Pago (POST /api/v1/webhooks/mercadopago).
 * Firma x-signature (HMAC-SHA256 con MP_WEBHOOK_SECRET y ventana de tiempo)
 * o 401. El evento se guarda en webhook_events (único por id externo) y el
 * pago se CONSULTA a la API de MP; el registro es idempotente por id de pago.
 * Si la API falla responde 502 para que MP reintente.
 */
final class MercadoPagoWebhookController
{
    public function __invoke(Request $request, CardGatewayConnector $gateway, CardPaymentService $cards, CurrentOrganization $organization): JsonResponse
    {
        if (! $cards->enabled()) {
            throw new ProblemException(503, 'card_gateway_disabled', 'El pago con tarjeta no está configurado.');
        }
        $query = self::rawQuery((string) $request->server('QUERY_STRING', ''));
        $body = (array) $request->json()->all();
        $dataId = (string) ($query['data.id'] ?? data_get($body, 'data.id', ''));
        $type = (string) ($query['type'] ?? $body['type'] ?? $query['topic'] ?? '');
        $requestId = (string) $request->header('x-request-id', '');
        $valid = $gateway->verifyWebhook((string) $request->getContent(), [
            'x-signature' => (string) $request->header('x-signature', ''), 'x-request-id' => $requestId, 'data.id' => $dataId,
        ]);
        if (! $valid) {
            throw new ProblemException(401, 'invalid_signature', 'Firma del webhook inválida o vencida.');
        }

        $eventId = (string) ($body['id'] ?? ($requestId !== '' ? $requestId : $type.':'.$dataId));
        DB::table('webhook_events')->insertOrIgnore([
            'id' => (string) Str::uuid(), 'organization_id' => $organization->id(), 'provider' => 'card_gateway',
            'external_event_id' => mb_substr($eventId, 0, 200), 'event_type' => mb_substr((string) ($body['action'] ?? $type), 0, 100),
            'signature_valid' => true, 'payload' => json_encode($body ?: new \stdClass, JSON_THROW_ON_ERROR),
            'headers' => json_encode(['x-request-id' => $requestId], JSON_THROW_ON_ERROR),
        ]);

        if ($type !== 'payment' || preg_match('/^\d{1,20}$/', $dataId) !== 1) {
            return response()->json(['status' => 'ignored']);
        }
        $checkout = $cards->confirm($dataId, null, 'webhook');

        return response()->json(['status' => $checkout === null ? 'ignored' : 'processed']);
    }

    /** Query sin la conversión de PHP de "data.id" a "data_id". @return array<string, string> */
    private static function rawQuery(string $qs): array
    {
        $out = [];
        foreach ($qs === '' ? [] : explode('&', $qs) as $pair) {
            [$k, $v] = array_pad(explode('=', $pair, 2), 2, '');
            $out[urldecode($k)] = urldecode($v);
        }

        return $out;
    }
}
