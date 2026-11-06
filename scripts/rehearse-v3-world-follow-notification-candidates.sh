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

# Full-string matches reject user-info tricks, extra @hosts, non-numeric
# ports, query overrides and any other nonstandard connection target.
[[ "$API_URL" =~ ^http://127\.0\.0\.1:[0-9]{2,5}/?$ ]] || fail "Refusing non-loopback Supabase API URL"
[[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@127\.0\.0\.1:[0-9]{2,5}(/postgres)?$ ]] || fail "Refusing non-loopback PostgreSQL URL"

psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-follow-notification-candidates.sql"
