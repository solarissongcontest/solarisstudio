#!/usr/bin/env bash
set -euo pipefail

fail() { printf '[tg10-world-notification-candidates] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI unavailable; isolated local verification required"
command -v psql >/dev/null 2>&1 || fail "PostgreSQL client unavailable; isolated local verification required"

# Never use caller-provided remote DB_URL. Resolve the disposable local stack
# and require loopback for both API and PostgreSQL before opening a connection.
eval "$(supabase status -o env)" || fail "Local Supabase stack is unavailable"
: "${API_URL:?Local Supabase API URL missing}"
: "${DB_URL:?Local Supabase DB URL missing}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing non-loopback Supabase API URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-loopback PostgreSQL URL" ;;
esac

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-follow-notification-candidates.sql"
