#!/usr/bin/env bash
set -euo pipefail
# Fail-closed disposable LOCAL Supabase only; never use remote DB URLs.
fail(){ printf '[tg7-external] Refused: %s\n' "$*" >&2; exit 1; }
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "psql unavailable"
command -v timeout >/dev/null 2>&1 || fail "timeout unavailable"
unset API_URL DB_URL
eval "$(supabase status -o env)"
: "${API_URL:?No disposable local API}"
: "${DB_URL:?No disposable local DB}"
case "$API_URL" in
 http://127.0.0.1:*|http://localhost:*) ;;
 *) fail "hosted API endpoint" ;;
esac
case "$DB_URL" in
 postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
 *) fail "hosted PostgreSQL endpoint" ;;
esac
PGCONNECT_TIMEOUT=5 timeout 90s psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
 -f "$DIR/rehearse-v3-world-external-intake.sql"
