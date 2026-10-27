<?php

$loadSecret = static function (string $key): void {
    $fileKey = $key.'_FILE';
    $path = $_ENV[$fileKey] ?? $_SERVER[$fileKey] ?? getenv($fileKey) ?: null;
    if (! is_string($path) || $path === '' || ! is_readable($path)) {
        return;
    }
    $value = rtrim((string) file_get_contents($path), "\r\n");
    if ($value === '') {
        return;
    }
    $_ENV[$key] = $value;
    $_SERVER[$key] = $value;
    putenv($key.'='.$value);
};

foreach (['APP_KEY', 'DB_PASSWORD', 'HUB_DB_APP_PASSWORD', 'REDIS_PASSWORD'] as $key) {
    $loadSecret($key);
}

$appKey = (string) (getenv('APP_KEY') ?: '');
if ((getenv('APP_ENV') ?: '') === 'production' && ! str_starts_with($appKey, 'base64:')) {
    fwrite(STDERR, "APP_KEY_FILE must contain a Laravel APP_KEY in base64 format.\n");
    exit(78);
}
