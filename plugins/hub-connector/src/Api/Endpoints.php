<?php

namespace HubConnector\Api;

/**
 * Mapa de endpoints de /public/wp (docs/13 §5) que el sistema ya publica.
 * Los demás (comparador, paquetes, dominios, promociones, legales, formularios,
 * estado, servidores, WHOIS y Libro) dependen de módulos aún no implementados.
 */
final class Endpoints
{
    public const SITE = '/public/wp/site';
    public const CATEGORIES = '/public/wp/catalog/categories';
    public const PLANS = '/public/wp/catalog/plans';
    public const CONTACT = '/public/wp/contact';

    public static function plan(string $id): string
    {
        return '/public/wp/catalog/plans/' . rawurlencode($id);
    }
}
