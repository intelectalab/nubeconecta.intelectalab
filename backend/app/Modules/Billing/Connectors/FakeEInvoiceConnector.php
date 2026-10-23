<?php

declare(strict_types=1);

namespace App\Modules\Billing\Connectors;

use App\Modules\Billing\Contracts\EInvoiceConnector;

/**
 * Conector SIMULADO (HUB_EINVOICE_DRIVER=fake): acepta todo y devuelve un CDR
 * ficticio marcado como simulación. No envía nada a SUNAT ni a ningún OSE/PSE
 * y se niega a operar en producción. Un comprobante con total 0,13 (13
 * céntimos) se rechaza a propósito para probar el flujo de rechazo.
 */
final class FakeEInvoiceConnector implements EInvoiceConnector
{
    public const REJECT_TOTAL_MINOR = 13;

    public function name(): string
    {
        return 'fake';
    }

    public function submit(array $document, string $idempotencyKey): array
    {
        if (app()->isProduction()) {
            return $this->result('error', null, 'HUB-SIM-00', 'El conector simulado no opera en producción: configure el OSE/PSE (D-01).');
        }
        $id = "{$document['series']}-{$document['number']}";
        if ((int) ($document['total_minor'] ?? 0) === self::REJECT_TOTAL_MINOR) {
            return $this->result('rejected', 'SIM-'.$id, '2800', 'SIMULACIÓN: rechazo de prueba del conector simulado.');
        }

        return $this->result('accepted', 'SIM-'.$id, '0', "SIMULACIÓN: el comprobante {$id} ha sido aceptado (CDR ficticio, sin validez ante SUNAT).", [
            'simulated' => true,
            'response_code' => '0',
            'description' => "SIMULACIÓN — La {$document['type_label']} número {$id}, ha sido aceptada",
            'document' => $id,
            'issuer_tax_id' => $document['issuer']['tax_id'] ?? null,
            'hash' => substr(hash('sha256', $idempotencyKey.$id), 0, 28),
            'received_at' => now()->toIso8601String(),
        ]);
    }

    public function void(string $reference, string $reason, string $idempotencyKey): array
    {
        if (app()->isProduction()) {
            return $this->result('error', $reference, 'HUB-SIM-00', 'El conector simulado no opera en producción.');
        }

        return $this->result('accepted', $reference, '0', "SIMULACIÓN: comunicación de baja de {$reference} aceptada.", ['simulated' => true, 'reason' => $reason]);
    }

    /** @param array<string, mixed>|null $cdr */
    private function result(string $status, ?string $reference, string $code, string $message, ?array $cdr = null): array
    {
        return ['status' => $status, 'provider' => 'fake', 'reference' => $reference, 'code' => $code, 'message' => $message, 'cdr' => $cdr, 'simulated' => true];
    }
}
