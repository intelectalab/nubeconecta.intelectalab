#!/bin/sh
set -eu
umask 077
BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
SECRETS_DIR=${SECRETS_DIR:-"$BASE_DIR/secrets"}
mkdir -p "$SECRETS_DIR"
chmod 700 "$SECRETS_DIR"

make_secret() {
  name=$1
  bytes=$2
  file="$SECRETS_DIR/$name.txt"
  if [ -s "$file" ]; then printf 'Keeping existing %s\n' "$name.txt"; return; fi
  openssl rand -base64 "$bytes" | tr -d '\r\n' > "$file"
  chmod 600 "$file"
  printf 'Created %s\n' "$name.txt"
}
make_secret db_owner_password 48
make_secret db_app_password 48
make_secret wp_db_password 48
make_secret wp_db_root_password 48
make_secret redis_password 48
make_secret hub_vault_key 32

APP_KEY_FILE="$SECRETS_DIR/laravel_app_key.txt"
if [ ! -s "$APP_KEY_FILE" ]; then
  php -r 'echo "base64:".base64_encode(random_bytes(32));' > "$APP_KEY_FILE"
  chmod 600 "$APP_KEY_FILE"
  printf 'Created laravel_app_key.txt\n'
else
  printf 'Keeping existing laravel_app_key.txt\n'
fi
printf 'Secret files prepared under %s; do not commit or share their contents.\n' "$SECRETS_DIR"
