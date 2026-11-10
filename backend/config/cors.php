<?php

declare(strict_types=1);

/*
 * CORS de la API. Las rutas del conector para webs a medida
 * (api/v1/public/wp/*) se EXCLUYEN a propósito: su CORS lo resuelve
 * AuthenticateWpSite, que responde solo al origen permitido del sitio
 * (docs/15 §4), nunca con comodín. El resto de la API conserva el CORS por
 * defecto del framework.
 */
return [
    'paths' => [
        'api/v1/auth/*',
        'api/v1/admin/*',
        'api/v1/portal/*',
        'api/v1/public/domain-availability',
        'api/v1/public/communication-unsubscribes',
        'sanctum/csrf-cookie',
    ],

    'allowed_methods' => ['*'],

    'allowed_origins' => ['*'],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,
];
