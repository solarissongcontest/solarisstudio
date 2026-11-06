#!/usr/bin/env bash
set -euo pipefail
# WORLD-05: disposable LOCAL Supabase ONLY. Never target hosted production.
fail(){ printf '[tg7-amendments] Refused: %s\n' "$*" >&2; exit 1; }
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI missing"
command -v psql >/dev/null 2>&1 || fail "psql missing"
command -v timeout >/dev/null 2>&1 || fail "timeout missing"
unset API_URL DB_URL
eval "$(supabase status -o env)"
: "${API_URL:?missing local API}"
: "${DB_URL:?missing local PostgreSQL}"
case "$API_URL" in
 http://localhost:*|http://127.0.0.1:*) ;;
 *) fail "non-loopback API" ;;
esac
case "$DB_URL" in
 postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
 *) fail "non-loopback PostgreSQL" ;;
esac
PGCONNECT_TIMEOUT=5 timeout 90s psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
 -f "$DIR/rehearse-v3-world-amendments.sql"
