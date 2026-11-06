#!/usr/bin/env bash
set -euo pipefail

# TG19: disposable LOCAL Supabase only. Never contact a hosted endpoint,
# never apply a migration; the fixture itself rolls back all inserts.
fail() { printf '[world-publication-boundary] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable (no production fallback)"
command -v psql >/dev/null 2>&1 || fail "psql unavailable (no production fallback)"

# Parse ONLY expected values rather than eval arbitrary CLI output.
local_status="$(supabase status -o env)" || fail "No running local Supabase stack"
API_URL=""
DB_URL=""
while IFS='=' read -r key value; do
  value="${value%\"}"
  value="${value#\"}"
  case "$key" in
    API_URL) API_URL="$value" ;;
    DB_URL) DB_URL="$value" ;;
  esac
done <<< "$local_status"

[[ "$API_URL" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]] ||
  fail "Refusing non-loopback Supabase API"
[[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@(127\.0\.0\.1|localhost):[0-9]+(/postgres)?$ ]] ||
  fail "Refusing non-loopback or unexpected-credential PostgreSQL URL"

# Fail if legacy application endpoints in this process point to production.
for key in VITE_SUPABASE_URL SUPABASE_URL E2E_SUPABASE_URL \
  VITE_CONFIRMATIONS_SUPABASE_URL CONFIRMATIONS_SUPABASE_URL; do
  value="${!key:-}"
  if [[ -n "$value" ]] && [[ ! "$value" =~ ^http://(127\.0\.0\.1|localhost):[0-9]+$ ]]; then
    fail "Refusing non-loopback environment variable: $key"
  fi
done

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-publication-boundary.sql"
printf '[world-publication-boundary] PASS: isolated World public/private visibility rehearsal\n'
