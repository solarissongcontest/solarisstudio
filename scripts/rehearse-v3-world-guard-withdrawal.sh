#!/usr/bin/env bash
set -euo pipefail

fail() { printf '[tg5-guard-withdrawal] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

# This runner only accepts the disposable loopback Supabase stack.
# Do not inherit a caller's hosted DB_URL or fall back to production.
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI not installed"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL psql not installed"
eval "$(supabase status -o env)"
[[ -n "$API_URL" && -n "$DB_URL" ]] || fail "Local Supabase not running"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted/non-local Supabase API" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local Postgres URL" ;;
esac

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-guard-withdrawal.sql"
