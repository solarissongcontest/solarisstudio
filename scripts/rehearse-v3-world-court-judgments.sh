#!/usr/bin/env bash
set -euo pipefail

# TG14 Court rehearsal: intentionally refuses every remote/project connection.
# Use a freshly started DISPOSABLE local Supabase CLI database only.
fail() { printf '[tg14-court] FAIL: %s\n' "$*" >&2; exit 1; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI required'
command -v psql >/dev/null 2>&1 || fail 'PostgreSQL psql required'
[[ -f "$here/rehearse-v3-world-court-judgments.sql" ]] || fail 'Missing rehearsal SQL'

# No fallback to DATABASE_URL, PGHOST or production credential variables.
unset DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE || true
status="$(supabase status -o env)" || fail 'Local disposable Supabase status unavailable'
eval "$status"
: "${API_URL:?Missing local Supabase API_URL}"
: "${DB_URL:?Missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail 'Refusing nonloopback Supabase API' ;;
esac
if ! [[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@(127\.0\.0\.1|localhost):[0-9]+/postgres$ ]]; then
  fail 'Refusing nonloopback or non-disposable database URL'
fi
PGSSLMODE=disable psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$here/rehearse-v3-world-court-judgments.sql"
