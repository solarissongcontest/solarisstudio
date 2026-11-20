#!/usr/bin/env bash
set -euo pipefail

# Fail closed: run ONLY against a disposable, locally running Supabase stack.
fail() { printf '[tg3-publication] FAIL: %s\n' "$*" >&2; exit 1; }
ROOT="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable"
eval "$(supabase status -o env)" || fail "Local Supabase stack unavailable"
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
  -f "$ROOT/rehearse-v3-world-country-publication.sql"
