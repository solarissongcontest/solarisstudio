#!/usr/bin/env bash
# WORLD-01 TG2 authoritative operational-mode SQL regression.
# Run with bash. Test traffic MUST remain on disposable loopback Supabase.
set -euo pipefail
fail() { printf '[tg2-platform-mode] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI unavailable'
command -v psql >/dev/null 2>&1 || fail 'psql unavailable'
unset API_URL DB_URL PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
LOCAL_STATUS="$(supabase status -o env)" || fail 'No local disposable Supabase stack'
eval "$LOCAL_STATUS"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail 'Supabase API endpoint must be loopback' ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail 'PostgreSQL endpoint must be local disposable' ;;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-platform-mode.sql"
