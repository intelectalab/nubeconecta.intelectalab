<?php

declare(strict_types=1);

namespace App\Modules\Billing\Contracts;

/**
 * Pasarela de tarjetas local (M-BIL §10, docs/08 ficha 20). Proveedor elegido
 * (D-18): Mercado Pago Checkout Pro (Connectors/MercadoPagoConnector). Nunca
 * recibe datos de tarjeta: formulario alojado por la pasarela (docs/10).
 */
interface CardGatewayConnector
{
    /** Llaves cargadas y driver activo: sin esto el portal no ofrece el pago con tarjeta. */
    public function isConfigured(): bool;

    /** @return list<string> monedas que la cuenta de la pasarela cobra */
    public function currencies(): array;

    /** Modo de prueba (enlace sandbox). */
    public function sandbox(): bool;

    /**
     * Crea la sesión de pago alojada para uno o varios comprobantes de la misma moneda.
     *
     * @param  list<string>  $invoiceIds
     * @param  array{title?: string, external_reference?: string, return_url?: string, expires_at?: \DateTimeInterface, payer_email?: ?string}  $context
     * @return array{session_id: string, redirect_url: string, expires_at: string}
     */
    public function createCheckout(string $checkoutId, array $invoiceIds, int $amountMinor, string $currency, string $idempotencyKey, array $context = []): array;

    /** Verifica la firma del webhook con el cuerpo crudo; $headers en minúsculas, más `data.id` de la URL. */
    public function verifyWebhook(string $rawBody, array $headers): bool;

    /**
     * Consulta la transacción en la pasarela (nunca se confía en parámetros del navegador).
     *
     * @return array{status: 'approved'|'declined'|'pending'|'other', external_id: ?string, amount_minor: int, currency: string, external_reference: ?string, status_detail: ?string, raw_status: string, fee_minor: int}
     */
    public function getTransaction(string $sessionId): array;

    /** @return array{status: 'succeeded'|'failed', external_id: ?string} */
    public function refund(string $externalId, int $amountMinor, string $idempotencyKey): array;
}
