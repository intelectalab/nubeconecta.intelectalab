<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Contracts;

/**
 * Consulta de disponibilidad de un dominio (D-35). La implementación por defecto usa
 * RDAP/WHOIS públicos; se reemplaza por la API de un registrador enlazando este
 * contrato, sin tocar la web.
 */
interface DomainAvailabilityChecker
{
    public const AVAILABLE = 'available';

    public const REGISTERED = 'registered';

    public const UNKNOWN = 'unknown';

    /**
     * @param  string  $label  etiqueta LDH ya validada y en minúsculas (`miempresa`)
     * @param  string  $tld  extensión sin punto (`pe`, `com.pe`)
     * @return 'available'|'registered'|'unknown' nunca `available` si hubo un error
     */
    public function check(string $label, string $tld): string;
}
