#!/usr/bin/env bash
set -euo pipefail
fail() { echo "[tg10-world-follows] FAIL: $*" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable"
eval "$(supabase status -o env)" || fail "No local Supabase stack"
: "${API_URL:?missing API_URL}"
: "${DB_URL:?missing DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted API";; esac
case "$DB_URL" in
 postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
 *) fail "Refusing non-loopback database";;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -f "$DIR/rehearse-v3-world-organization-follows.sql"
