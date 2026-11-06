#!/usr/bin/env bash
# WORLD-01 TG1 rollback-only authoritative SQL check. Invoke with bash.
# Never allow hosted Solaris Supabase or caller-supplied DB URLs.
set -euo pipefail
fail() { printf '[tg1-controller-cas] FAIL: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI unavailable'
command -v psql >/dev/null 2>&1 || fail 'psql unavailable'

# Discard potentially inherited production connection configuration.
unset API_URL DB_URL PGPASSWORD PGHOST PGPORT PGUSER PGDATABASE
LOCAL_STATUS="$(supabase status -o env)" || fail 'Disposable local Supabase is not running'
eval "$LOCAL_STATUS"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail 'Refusing non-loopback Supabase API' ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail 'Refusing non-loopback/non-disposable PostgreSQL' ;;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-controller-cas.sql"
