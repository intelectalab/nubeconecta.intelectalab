# Imagen de WordPress de producción: núcleo oficial + plugins de wordpress.org con
# versión fijada y suma SHA-256 verificada + plugin Hub Connector del repositorio.
# Los plugins de terceros quedan en /usr/src/wordpress (la imagen oficial los copia
# a /var/www/html al iniciar un volumen vacío); después se actualizan desde el
# escritorio de WordPress o subiendo estas versiones y reconstruyendo.

FROM alpine:3.20 AS wp-plugins
RUN apk add --no-cache curl unzip
# slug:versión:sha256 (downloads.wordpress.org/plugin/<slug>.<versión>.zip)
ARG WP_PLUGINS="\
kadence-blocks:3.8.0.2:42c82f31f9f9fcf22b4161696cf255f3af022cd87f68dbdedd9b3a2232d40e14 \
wordpress-seo:28.8:27cc01cb149db7186ef750552a5cc2ae5028933473886e419918af273b075105 \
post-expirator:4.11.2:e84e39871c7960c7de12615053ba3bb353cb9edafb8f66d9812752b6f4690d04 \
publishpress:4.8.2:aa8a9990e998c7128642b62219d08f73a25174327cbd090f24326c2b94345187"
RUN set -eu; mkdir -p /plugins; cd /tmp; \
    for spec in $WP_PLUGINS; do \
        slug="${spec%%:*}"; rest="${spec#*:}"; version="${rest%%:*}"; sum="${rest#*:}"; \
        curl -fsSL --retry 3 -o plugin.zip "https://downloads.wordpress.org/plugin/${slug}.${version}.zip"; \
        echo "${sum}  plugin.zip" | sha256sum -c -; \
        unzip -q plugin.zip -d /plugins; \
        test -d "/plugins/${slug}"; \
        rm plugin.zip; \
    done

FROM wordpress:php8.2-apache
ARG INSTALL_HUB_CONNECTOR=1
COPY infra/docker/wordpress/wordpress-rewrites.conf /etc/apache2/conf-enabled/zz-wordpress-rewrites.conf
COPY --from=wp-plugins --chown=www-data:www-data /plugins/ /usr/src/wordpress/wp-content/plugins/
RUN if [ "$INSTALL_HUB_CONNECTOR" = "1" ]; then mkdir -p /usr/src/wordpress/wp-content/plugins/hub-connector; fi
COPY --chown=www-data:www-data plugins/hub-connector/ /usr/src/wordpress/wp-content/plugins/hub-connector/
