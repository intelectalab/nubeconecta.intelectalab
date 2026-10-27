#!/bin/sh
# Builds a timestamped, checksummed archive of both databases and WP uploads.
# Schedule daily on the VPS and replicate encrypted archives off-host.
set -eu
BASE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$BASE_DIR"
BACKUP_DIR=${BACKUP_DIR:-"$BASE_DIR/backups"}
SECRETS_DIR=${SECRETS_DIR:-"$BASE_DIR/secrets"}
DB_DATABASE=${DB_DATABASE:?Set DB_DATABASE}
DB_OWNER_USERNAME=${DB_OWNER_USERNAME:?Set DB_OWNER_USERNAME}
WP_DB_NAME=${WP_DB_NAME:?Set WP_DB_NAME}
BACKUP_RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-30}
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
WORK="$BACKUP_DIR/.work-$STAMP"
ARCHIVE="$BACKUP_DIR/hub-backup-$STAMP.tar.gz"
mkdir -p "$BACKUP_DIR" "$WORK"
chmod 700 "$BACKUP_DIR" "$WORK"
cleanup() { rm -rf "$WORK"; }
trap cleanup EXIT HUP INT TERM
for secret in db_owner_password wp_db_root_password; do
  [ -r "$SECRETS_DIR/$secret.txt" ] || { echo "Missing secret file: $secret.txt" >&2; exit 2; }
done

OWNER_PASSWORD=$(cat "$SECRETS_DIR/db_owner_password.txt")
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T -e PGPASSWORD="$OWNER_PASSWORD" postgres \
  pg_dump -Fc -U "$DB_OWNER_USERNAME" "$DB_DATABASE" > "$WORK/hub-postgres.dump"
unset OWNER_PASSWORD
WP_ROOT_PASSWORD=$(cat "$SECRETS_DIR/wp_db_root_password.txt")
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T -e MYSQL_PWD="$WP_ROOT_PASSWORD" wordpress_db \
  mariadb-dump --single-transaction --routines --events -uroot "$WP_DB_NAME" > "$WORK/wordpress-mariadb.sql"
unset WP_ROOT_PASSWORD
docker compose -f docker-compose.yml -f docker-compose.production.yml exec -T wordpress \
  tar -C /var/www/html/wp-content -czf - uploads > "$WORK/wordpress-uploads.tar.gz"
{
  printf 'created_utc=%s\npostgres_database=%s\nwordpress_database=%s\n' "$STAMP" "$DB_DATABASE" "$WP_DB_NAME"
  (cd "$WORK" && sha256sum hub-postgres.dump wordpress-mariadb.sql wordpress-uploads.tar.gz)
} > "$WORK/MANIFEST"
tar -C "$BACKUP_DIR" -czf "$ARCHIVE" ".work-$STAMP"
chmod 600 "$ARCHIVE"
rm -rf "$WORK"
trap - EXIT HUP INT TERM
find "$BACKUP_DIR" -maxdepth 1 -type f -name 'hub-backup-*.tar.gz' -mtime "+$BACKUP_RETENTION_DAYS" -delete
printf 'Backup created: %s\n' "$ARCHIVE"
printf '%s\n' 'Copy it off the VPS and test database and uploads restore before relying on it.'
