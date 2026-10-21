#!/bin/sh
# Entrypoint de app/worker/scheduler.
# Si el código montado no trae vendor/ (desarrollo con ../backend montado),
# instala las dependencias una sola vez. Los tres contenedores comparten el
# montaje, así que se serializa con flock para que no corran a la vez.
set -e

cd /var/www/html

if [ ! -f vendor/autoload.php ]; then
    mkdir -p storage/framework
    (
        flock 9
        if [ ! -f vendor/autoload.php ]; then
            echo "[hub-entrypoint] vendor/ no existe: ejecutando composer install"
            if [ "${APP_ENV:-local}" = "production" ]; then
                composer install --no-dev --prefer-dist --optimize-autoloader --no-progress
            else
                composer install --prefer-dist --no-progress
            fi
        fi
    ) 9>storage/framework/.composer-install.lock
fi

mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache

exec "$@"
