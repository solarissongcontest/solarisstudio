#!/usr/bin/env bash
set -euo pipefail
eval "$(supabase status -o env)"
: "${DB_URL:?missing isolated database URL}"
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) echo 'Refusing Anniversary rehearsal outside isolated loopback PostgreSQL' >&2; exit 1 ;;
esac
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -f "$(dirname "${BASH_SOURCE[0]}")/v3-edition-metadata-acceptance.sql"
