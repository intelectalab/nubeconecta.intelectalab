<?php

declare(strict_types=1);

namespace App\Modules\Billing\Connectors;

use App\Modules\Billing\Contracts\EInvoiceConnector;

/** Driver sin implementar (OSE/PSE real aún no elegido, D-01): todo envío queda en `error` y el comprobante sigue `pending`. */
final class UnconfiguredEInvoiceConnector implements EInvoiceConnector
{
    public function __construct(private readonly string $driver) {}

    public function name(): string
    {
        return $this->driver;
    }

    public function submit(array $document, string $idempotencyKey): array
    {
        return $this->error();
    }

    public function void(string $reference, string $reason, string $idempotencyKey): array
    {
        return $this->error();
    }

    private function error(): array
    {
        return ['status' => 'error', 'provider' => $this->driver, 'reference' => null, 'code' => null, 'message' => "Conector de facturación electrónica '{$this->driver}' no implementado (D-01).", 'cdr' => null, 'simulated' => false];
    }
}
