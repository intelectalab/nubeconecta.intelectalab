<?php

namespace HubConnector\Api;

/**
 * Mapa de endpoints de /public/wp (docs/13 §5) que el sistema ya publica.
 * Pendientes: paquetes, promociones, estado de servicios, servidores y Libro.
 */
final class Endpoints
{
    public const SITE = '/public/wp/site';
    public const CATEGORIES = '/public/wp/catalog/categories';
    public const PLANS = '/public/wp/catalog/plans';
    public const COMPARE = '/public/wp/catalog/compare';
    public const DOMAIN_PRICES = '/public/wp/catalog/domain-prices';
    public const CONTACT = '/public/wp/contact';
    public const DOMAIN_AVAILABILITY = '/public/wp/domains/availability';

    public static function plan(string $id): string
    {
        return '/public/wp/catalog/plans/' . rawurlencode($id);
    }

    public static function legalDocument(string $slug): string
    {
        return '/public/wp/legal-documents/' . rawurlencode($slug);
    }

    public static function form(string $code): string
    {
        return '/public/wp/forms/' . rawurlencode($code);
    }

    public static function formSubmissions(string $code): string
    {
        return '/public/wp/forms/' . rawurlencode($code) . '/submissions';
    }
}
