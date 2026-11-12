<?php

declare(strict_types=1);

namespace App\Shared\Http\Problem;

use RuntimeException;

/**
 * Error de negocio que se responde como application/problem+json (RFC 9457).
 * `code` es el valor estable que usa el frontend (docs/06 §5).
 */
class ProblemException extends RuntimeException
{
    /** @param array<string, mixed> $extra */
    public function __construct(
        public readonly int $status,
        public readonly string $problemCode,
        ?string $detail = null,
        public readonly array $extra = [],
        public readonly array $headers = [],
    ) {
        parent::__construct($detail ?? '');
    }

    /**
     * Reporte selectivo (lo invoca el handler de Laravel): los errores de negocio
     * 4xx (403, 404, 409, 422…) son esperados y NO se registran, para no ahogar el
     * log con ruido normal. Los 5xx sí caen al logger por defecto (devolver false
     * deja que el handler haga el reporte estándar).
     */
    public function report(): bool
    {
        return $this->status < 500;
    }

    public static function forbidden(?string $detail = null): self
    {
        return new self(403, 'forbidden', $detail);
    }

    public static function mfaRequired(?string $detail = null): self
    {
        return new self(403, 'mfa_required', $detail);
    }

    public static function notFound(): self
    {
        return new self(404, 'not_found');
    }

    public static function versionConflict(int $current): self
    {
        return new self(409, 'version_conflict', null, ['current_version' => $current]);
    }

    public static function badRequest(string $detail): self
    {
        return new self(400, 'bad_request', $detail);
    }

    /** @param array<string, list<string>> $errors */
    public static function validation(array $errors): self
    {
        return new self(422, 'validation_failed', null, ['errors' => $errors]);
    }
}
