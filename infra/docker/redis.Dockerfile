FROM redis:7-alpine
COPY infra/docker/redis-entrypoint.sh /usr/local/bin/hub-redis-entrypoint
RUN chmod 0755 /usr/local/bin/hub-redis-entrypoint
ENTRYPOINT ["/usr/local/bin/hub-redis-entrypoint"]
