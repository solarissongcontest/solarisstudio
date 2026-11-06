#!/usr/bin/env bash
set -euo pipefail

# Disposable, local-only TG8 SQL rehearsal. Never use hosted project values.
fail() { printf '[tg8-vote-math] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI not installed"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client not installed"

eval "$(supabase status -o env)" || fail "No local Supabase stack"
[ -n "$API_URL" ] || fail "Missing local API URL"
[ -n "$DB_URL" ] || fail "Missing local database URL"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted/non-loopback Supabase API" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing hosted/non-loopback database" ;;
esac

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-exact-vote-math.sql"
