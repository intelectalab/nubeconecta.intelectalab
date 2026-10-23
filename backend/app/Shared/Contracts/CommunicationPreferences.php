<?php

declare(strict_types=1);

namespace App\Shared\Contracts;

/**
 * Puerto que consultan SAL y AUT antes de enviar (RN-CUS-001). Lo implementa
 * Customers: una baja comercial en cualquier canal excluye todos los canales;
 * los avisos transaccionales (cobranza, servicio) no dependen del consentimiento.
 */
interface CommunicationPreferences
{
    /** @param 'marketing'|'transactional' $kind */
    public function maySend(string $contactId, string $channel, string $kind = 'marketing'): bool;

    /** Registra una baja comercial por correo (webhook de Elastic Email vía SAL/AUT). Devuelve cuántos contactos afectó. */
    public function recordUnsubscribeByEmail(string $email, string $source = 'elastic_email', array $evidence = []): int;
}
