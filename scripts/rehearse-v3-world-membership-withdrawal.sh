#!/usr/bin/env bash
set -euo pipefail
fail() { printf '[world03-tg5-withdrawal] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# Only disposable local Supabase is permitted, with no hosted credentials.
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL psql unavailable"
eval "$(supabase status -o env)"
[[ -n "$API_URL" && -n "$DB_URL" ]] || fail "Local Supabase is not running"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing non-local Supabase API" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local PostgreSQL URL" ;;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-membership-withdrawal.sql"
