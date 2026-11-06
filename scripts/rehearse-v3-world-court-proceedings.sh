#!/usr/bin/env bash
set -euo pipefail

# Fail closed. No hosted Supabase, CI production, preview fallback or ambient DATABASE_URL.
fail(){ printf '[tg14-court] Refusing unsafe rehearsal: %s\n' "$*" >&2; exit 1; }
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI is missing'
command -v psql >/dev/null 2>&1 || fail 'psql is missing'
eval "$(supabase status -o env)"
: "${API_URL:?Local Supabase API_URL missing}"
: "${DB_URL:?Local Supabase DB_URL missing}"
case "$API_URL" in
 http://127.0.0.1:*|http://localhost:*) ;;
 *) fail 'API_URL is not loopback' ;;
esac
case "$DB_URL" in
 postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
 *) fail 'DB_URL is not the disposable loopback CLI database' ;;
esac
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 -f "$SCRIPT_DIR/rehearse-v3-world-court-proceedings.sql"
