# Imagen PHP 8.3 FPM para app, worker (Horizon) y scheduler.
# Contexto de build: raíz del repo (ver infra/docker-compose.yml);
# lo que entra al contexto lo filtra infra/docker/php/Dockerfile.dockerignore.
FROM php:8.3-fpm-alpine

# phpredis (PECL) es opcional y está desactivado por defecto: la app usa predis
# (REDIS_CLIENT=predis). Para incluirlo: --build-arg INSTALL_PHPREDIS=1
ARG INSTALL_PHPREDIS=0

# Dependencias del sistema y extensiones requeridas por docs/00
RUN apk add --no-cache \
        libpq \
        libzip \
        libpng \
        libjpeg-turbo \
        freetype \
        icu-libs \
        oniguruma \
        git \
        unzip \
    && apk add --no-cache --virtual .build-deps \
        postgresql-dev \
        libzip-dev \
        libpng-dev \
        libjpeg-turbo-dev \
        freetype-dev \
        icu-dev \
        oniguruma-dev \
        linux-headers \
        $PHPIZE_DEPS \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j$(nproc) \
        pdo_pgsql \
        pgsql \
        bcmath \
        intl \
        pcntl \
        zip \
        gd \
        opcache \
    && if [ "$INSTALL_PHPREDIS" = "1" ]; then \
           pecl install redis && docker-php-ext-enable redis; \
       fi \
    && apk del .build-deps \
    && rm -rf /tmp/pear

# Composer (versión mayor fija)
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
ENV COMPOSER_ALLOW_SUPERUSER=1 \
    COMPOSER_NO_INTERACTION=1

WORKDIR /var/www/html

# Código y dependencias horneados en la imagen (staging/producción).
# En desarrollo el compose monta ../backend encima; si ese montaje no trae
# vendor/, el entrypoint ejecuta composer install.
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-scripts --no-autoloader --no-progress
COPY backend/ ./
# Esquema canónico que carga la migración base (HUB_SCHEMA_PATH por defecto: ../database/schema.sql)
COPY database/ /var/www/database/
RUN composer dump-autoload --optimize --no-dev --no-scripts \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    # El contexto copiado desde Windows/OneDrive puede traer directorios sin escritura (r-x).
    && chmod -R u+rwX storage bootstrap/cache

COPY infra/docker/php/entrypoint.sh /usr/local/bin/hub-entrypoint
RUN sed -i 's/\r$//' /usr/local/bin/hub-entrypoint && chmod +x /usr/local/bin/hub-entrypoint

EXPOSE 9000
ENTRYPOINT ["hub-entrypoint"]
CMD ["php-fpm"]
