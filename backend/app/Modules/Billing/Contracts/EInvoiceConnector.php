<?php

declare(strict_types=1);

namespace App\Modules\Billing\Contracts;

/**
 * Conector del proveedor de facturación electrónica (docs/08 §21, OSE/PSE por
 * elegir: D-01). Franja MVP de la interfaz: emitir y comunicar la baja; la
 * consulta de estado, el reenvío y los webhooks quedan pendientes.
 *
 * Resultado: status accepted|rejected|error, provider, reference (id externo),
 * code y message de la respuesta, cdr (constancia de recepción o null) y
 * simulated (true solo en el conector de simulación).
 *
 * @phpstan-type Result array{status: 'accepted'|'rejected'|'error', provider: string, reference: ?string, code: ?string, message: string, cdr: ?array<string, mixed>, simulated: bool}
 */
interface EInvoiceConnector
{
    public function name(): string;

    /**
     * @param  array<string, mixed>  $document  comprobante ya numerado (emisor, cliente, líneas, totales)
     * @return Result
     */
    public function submit(array $document, string $idempotencyKey): array;

    /** @return Result */
    public function void(string $reference, string $reason, string $idempotencyKey): array;
}
