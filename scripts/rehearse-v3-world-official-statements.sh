#!/usr/bin/env bash
set -euo pipefail
fail() { echo "[tg9-world-statements] FAIL: $*" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable"
eval "$(supabase status -o env)" || fail "No local Supabase stack"
[[ -n "$API_URL" && -n "$DB_URL" ]] || fail "Missing local API_URL/DB_URL"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted API";; esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-loopback database";;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -f "$DIR/rehearse-v3-world-official-statements.sql"
