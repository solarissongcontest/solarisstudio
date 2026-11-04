#!/usr/bin/env bash
set -euo pipefail

# This source-controlled exercise is restricted to a disposable LOCAL
# Supabase stack. Never fall back to hosted Supabase or CI DATABASE_URL.
fail() { printf '[tg6-attendance] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL psql unavailable"
eval "$(supabase status -o env)"
: "${API_URL:?local Supabase API_URL missing}"
: "${DB_URL:?local Supabase DB_URL missing}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database URL" ;;
esac

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-session-attendance.sql"
