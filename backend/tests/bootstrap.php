<?php

declare(strict_types=1);

// Compose's runtime queue/cache settings must not leak into isolated tests.
foreach ([
    'APP_ENV' => 'testing',
    'CACHE_STORE' => 'array',
    'QUEUE_CONNECTION' => 'sync',
] as $name => $value) {
    putenv("{$name}={$value}");
    $_ENV[$name] = $value;
    $_SERVER[$name] = $value;
}

require dirname(__DIR__).'/vendor/autoload.php';
