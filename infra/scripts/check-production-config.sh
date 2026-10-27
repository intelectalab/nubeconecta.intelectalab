#!/bin/sh
set -eu

: "${DB_DATABASE:?Set DB_DATABASE}"
: "${DB_OWNER_USERNAME:?Set DB_OWNER_USERNAME}"
: "${WP_DB_NAME:?Set WP_DB_NAME}"
: "${WP_DB_USER:?Set WP_DB_USER}"
: "${HUB_DOMAIN:?Set HUB_DOMAIN}"
: "${WP_DOMAIN:?Set WP_DOMAIN}"
: "${ACME_EMAIL:?Set ACME_EMAIL}"

BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SECRETS_DIR=${SECRETS_DIR:-"$BASE_DIR/secrets"}
missing=0
for f in db_owner_password db_app_password wp_db_password wp_db_root_password redis_password laravel_app_key hub_vault_key; do
  if [ ! -s "$SECRETS_DIR/$f.txt" ]; then
    printf 'Missing secret file: %s\n' "$SECRETS_DIR/$f.txt" >&2
    missing=1
  fi
done
[ "$missing" -eq 0 ] || exit 2

printf '%s\n' 'Production configuration and required secrets are present.'
printf '%s\n' 'Build release images, migrate using the owner DB credentials, create the restricted hub_app_login role, configure HTTPS DNS, and test backups before production traffic.'
