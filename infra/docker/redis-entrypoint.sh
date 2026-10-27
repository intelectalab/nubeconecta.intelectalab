#!/bin/sh
set -eu
secret_file="$1"
if [ ! -r "$secret_file" ]; then
  echo "Required Redis secret file missing or unreadable: $secret_file" >&2
  exit 78
fi
exec redis-server --appendonly yes --requirepass "$(cat "$secret_file")"
