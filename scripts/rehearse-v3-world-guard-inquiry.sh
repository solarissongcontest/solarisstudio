#!/usr/bin/env bash
set -euo pipefail

# Never run this rehearsal against a hosted Solaris database or any remote DB.
# Only disposable local Supabase CLI Postgres is allowed. No fallback.
fail(){ printf '[world-guard-inquiry] FAIL: %s\n' "$*" >&2; exit 1; }
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI is unavailable'
command -v psql >/dev/null 2>&1 || fail 'PostgreSQL client psql is unavailable'
[[ -f "$here/rehearse-v3-world-guard-inquiry.sql" ]] || fail 'Missing local rehearsal SQL'
unset DATABASE_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE PGSSLMODE || true
local_env="$(supabase status -o env)" || fail 'Disposable local Supabase is not running'
eval "$local_env"
: "${API_URL:?Missing local API_URL}"
: "${DB_URL:?Missing local DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail 'Refusing nonloopback Supabase API' ;;
esac
if ! [[ "$DB_URL" =~ ^postgres(ql)?://postgres:postgres@(127\.0\.0\.1|localhost):[0-9]+/postgres$ ]]; then
  fail 'Refusing nonloopback or non-disposable PostgreSQL URL'
fi
PGSSLMODE=disable psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$here/rehearse-v3-world-guard-inquiry.sql"
