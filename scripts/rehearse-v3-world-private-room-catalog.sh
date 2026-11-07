#!/usr/bin/env bash
set -euo pipefail

# TG19: disposable LOCAL Supabase only. Never use hosted credentials,
# never run migrations; catalog SQL is READ ONLY and ROLLBACK-only.
fail() { printf '[world-private-catalog] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail "Local Supabase CLI not installed"
command -v psql >/dev/null 2>&1 || fail "Local PostgreSQL client not installed"

# Never eval Supabase CLI output. Accept only exact API_URL and DB_URL keys.
status="$(supabase status -o env)" || fail "No disposable local Supabase stack"
API_URL=""
DB_URL=""
while IFS='=' read -r name value; do
  value="${value#\"}"
  value="${value%\"}"
  value="${value#\'}"
  value="${value%\'}"
  case "$name" in
    API_URL) API_URL="$value" ;;
    DB_URL) DB_URL="$value" ;;
  esac
done <<< "$status"

[[ "$API_URL" =~ ^http://127\.0\.0\.1:[0-9]+$ ]] ||
  fail "Refusing non-loopback or invalid Supabase API URL"
[[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@127\.0\.0\.1:[0-9]+(/postgres)?$ ]] ||
  fail "Refusing remote or unexpected-credential database URL"

# Do not allow inherited libpq variables to override the validated DSN.
unset PGHOST PGHOSTADDR PGPORT PGDATABASE PGUSER PGPASSWORD PGPASSFILE \
  PGSERVICE PGSERVICEFILE PGOPTIONS PGCONNECT_TIMEOUT PGTARGETSESSIONATTRS \
  PGSSLMODE PGSSLROOTCERT PGSSLKEY PGSSLCERT PGGSSENCMODE

for key in VITE_SUPABASE_URL SUPABASE_URL E2E_SUPABASE_URL \
  VITE_CONFIRMATIONS_SUPABASE_URL CONFIRMATIONS_SUPABASE_URL; do
  value="${!key:-}"
  if [[ -n "$value" && ! "$value" =~ ^http://127\.0\.0\.1:[0-9]+$ ]]; then
    fail "Refusing inherited remote Supabase client: $key"
  fi
done

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-private-room-catalog.sql"
printf '[world-private-catalog] PASS: local private room privilege rehearsal\n'
