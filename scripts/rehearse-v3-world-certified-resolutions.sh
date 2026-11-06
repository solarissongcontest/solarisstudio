#!/usr/bin/env bash
set -euo pipefail

# WORLD-06 TG9: disposable local Supabase ONLY.
# Reuse WORLD-05's certified vote fixture within one rollback transaction.
fail() { printf '[world-06 TG9] Refused: %s\n' "$*" >&2; exit 1; }
DIR="$(cd "$(dirname "$0")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI unavailable'
command -v psql >/dev/null 2>&1 || fail 'psql unavailable'
command -v timeout >/dev/null 2>&1 || fail 'timeout unavailable'

# Never accept externally supplied production credentials as fallback.
unset API_URL DB_URL
eval "$(supabase status -o env)" || fail 'local Supabase not running'
test -n "$API_URL" || fail 'Local API URL missing'
test -n "$DB_URL" || fail 'Local DB URL missing'
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail 'Refusing non-loopback API';; esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail 'Refusing non-loopback database';;
esac
PGCONNECT_TIMEOUT=5 timeout 120s psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$DIR/rehearse-v3-world-legislative-votes.sql" \
  -f "$DIR/rehearse-v3-world-certified-resolutions.sql"
