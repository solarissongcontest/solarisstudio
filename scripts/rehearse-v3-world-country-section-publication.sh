#!/usr/bin/env bash
set -euo pipefail

# Publication regression may only run on disposable LOCAL Supabase.
# Never use hosted DB, generic DATABASE_URL, or CI secret fallbacks.
fail() { printf '[tg3-publication] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable"
eval "$(supabase status -o env)" || fail "Local Supabase stack is not running"
: "${API_URL:?missing local API_URL}"
: "${DB_URL:?missing local DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing non-loopback Supabase API" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-loopback database" ;;
esac

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-country-section-publication.sql"
