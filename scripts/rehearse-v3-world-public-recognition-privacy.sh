#!/usr/bin/env bash
set -euo pipefail

# TG2/TG3/TG19 rollback-only privacy rehearsal.
# Never accept hosted/non-loopback API or DB URLs, even with explicit env vars.
fail() { printf '[world-recognition-privacy] FAIL: %s\n' "$*" >&2; exit 1; }
command -v supabase >/dev/null 2>&1 || fail 'Supabase CLI not installed'
command -v psql >/dev/null 2>&1 || fail 'psql not installed'

# Parse only known keys from the CLI's LOCAL status; never eval shell output.
status_output="$(supabase status -o env)" || fail 'Local Supabase stack unavailable'
API_URL=''
DB_URL=''
while IFS= read -r line; do
  case "$line" in
    API_URL=*) API_URL="${line#API_URL=}" ;;
    DB_URL=*) DB_URL="${line#DB_URL=}" ;;
  esac
done <<< "$status_output"
# Supabase CLI may quote its env values.
API_URL="${API_URL#\"}"; API_URL="${API_URL%\"}"
DB_URL="${DB_URL#\"}"; DB_URL="${DB_URL%\"}"

[ -n "$API_URL" ] || fail 'Missing local Supabase API URL'
[ -n "$DB_URL" ] || fail 'Missing local Supabase DB URL'
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail 'Refusing hosted/non-loopback API endpoint' ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*/*|postgresql://postgres:postgres@127.0.0.1:*/*|postgres://postgres:postgres@localhost:*/*|postgresql://postgres:postgres@localhost:*/*) ;;
  *) fail 'Refusing hosted/non-loopback database endpoint' ;;
esac

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
psql "$DB_URL" --no-psqlrc -v ON_ERROR_STOP=1 \
  -f "$SCRIPT_DIR/rehearse-v3-world-public-recognition-privacy.sql"
