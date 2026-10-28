# syntax=docker/dockerfile:1
FROM php:8.3-fpm-alpine AS base
RUN apk add --no-cache libpq libzip libpng libjpeg-turbo freetype icu-libs oniguruma git unzip

FROM base AS extensions
ARG INSTALL_PHPREDIS=0
RUN apk add --no-cache --virtual .build-deps \
        postgresql-dev libzip-dev libpng-dev libjpeg-turbo-dev freetype-dev \
        icu-dev oniguruma-dev linux-headers $PHPIZE_DEPS \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql pgsql bcmath intl pcntl zip gd opcache \
    && if [ "$INSTALL_PHPREDIS" = "1" ]; then pecl install redis && docker-php-ext-enable redis; fi \
    && apk del .build-deps \
    && rm -rf /tmp/pear

FROM base AS builder
ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1
COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
WORKDIR /var/www/html
COPY backend/composer.json backend/composer.lock ./
RUN composer install --no-dev --prefer-dist --no-scripts --no-autoloader --no-progress
COPY backend/ ./
COPY database/ /var/www/database/
RUN composer dump-autoload --optimize --no-dev --no-scripts \
    && mkdir -p storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache \
    && chown -R www-data:www-data storage bootstrap/cache \
    && chmod -R u+rwX storage bootstrap/cache
COPY infra/docker/php/entrypoint.sh /usr/local/bin/hub-entrypoint
COPY infra/docker/php/load-secrets.php /usr/local/lib/hub/load-secrets.php
RUN sed -i 's/\r$//' /usr/local/bin/hub-entrypoint \
    && chmod 0755 /usr/local/bin/hub-entrypoint \
    && printf '%s\n' 'auto_prepend_file=/usr/local/lib/hub/load-secrets.php' > /usr/local/etc/php/conf.d/zz-hub-secrets.ini

FROM base AS runtime
ARG INSTALL_PHPREDIS=0
COPY --from=extensions /usr/local/lib/php/extensions/ /usr/local/lib/php/extensions/
COPY --from=extensions /usr/local/etc/php/conf.d/ /usr/local/etc/php/conf.d/
COPY --from=builder /usr/local/etc/php/conf.d/zz-hub-secrets.ini /usr/local/etc/php/conf.d/zz-hub-secrets.ini
COPY --from=builder /usr/local/lib/hub/load-secrets.php /usr/local/lib/hub/load-secrets.php
COPY --from=builder /usr/local/bin/hub-entrypoint /usr/local/bin/hub-entrypoint
COPY --from=builder --chown=www-data:www-data /var/www/html /var/www/html
COPY --from=builder /var/www/database /var/www/database
WORKDIR /var/www/html
EXPOSE 9000
ENTRYPOINT ["hub-entrypoint"]
CMD ["php-fpm"]

FROM runtime AS development
COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer
ENV COMPOSER_ALLOW_SUPERUSER=1 COMPOSER_NO_INTERACTION=1
