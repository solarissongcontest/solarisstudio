#!/usr/bin/env bash
set -euo pipefail

# WORLD-05 TG8 rehearsal: NEVER allow hosted Supabase/remote Postgres.
# This runs against the disposable local Supabase CLI stack only and every
# fixture change is inside BEGIN / ROLLBACK.
fail() { printf '[world-05 TG8] Refused: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "local Supabase CLI is unavailable"
command -v psql >/dev/null 2>&1 || fail "psql is unavailable"
command -v timeout >/dev/null 2>&1 || fail "timeout guard is unavailable"

# Never accept caller-provided production URLs as fallbacks.
unset API_URL DB_URL
eval "$(supabase status -o env)"
: "${API_URL:?Local API URL missing}"
: "${DB_URL:?Local database URL missing}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "API_URL is not loopback" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "DB_URL is not local disposable Supabase Postgres" ;;
esac
PGCONNECT_TIMEOUT=5 timeout 120s psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-legislative-votes.sql" \
  -f "$SCRIPT_DIR/rehearse-v3-world-legislative-votes-checks.sql"
