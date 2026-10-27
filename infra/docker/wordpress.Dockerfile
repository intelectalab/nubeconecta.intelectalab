FROM wordpress:php8.2-apache
ARG INSTALL_HUB_CONNECTOR=1
COPY infra/docker/wordpress/wordpress-rewrites.conf /etc/apache2/conf-enabled/zz-wordpress-rewrites.conf
RUN if [ "$INSTALL_HUB_CONNECTOR" = "1" ]; then mkdir -p /usr/src/wordpress/wp-content/plugins/hub-connector; fi
COPY --chown=www-data:www-data plugins/hub-connector/ /usr/src/wordpress/wp-content/plugins/hub-connector/
