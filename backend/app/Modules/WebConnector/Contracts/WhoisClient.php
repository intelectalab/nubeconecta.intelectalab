<?php

declare(strict_types=1);

namespace App\Modules\WebConnector\Contracts;

/** Consulta WHOIS (puerto 43) a un servidor de la lista blanca; inyectable en pruebas. */
interface WhoisClient
{
    /** @return string|null respuesta de texto o null si falló la conexión */
    public function query(string $host, string $domain): ?string;
}
