#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-delete-guard] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-delete-guard] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This script runs immediately after the main Archive guard rehearsal, which
# leaves EDITION_A in canonical archived state. It adds the missing negative
# path proving that a privileged direct DELETE cannot erase that lifecycle fact.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

export SUPABASE_URL="$API_URL" E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

EDITION_A='18910000-0000-4000-8000-000000000001'
state="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")"
[[ "$state" == 'archived' ]] || fail "Archive guard fixture is not archived before delete test"

log "Archived runtime row cannot be deleted by service role"
output="$(mktemp)"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
  "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; delete from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;" \
  >"$output" 2>&1; then
  cat "$output" >&2
  rm -f "$output"
  fail "service-role archived runtime deletion unexpectedly succeeded"
fi

grep -Fq 'Archived edition runtime is irreversible.' "$output" || {
  cat "$output" >&2
  rm -f "$output"
  fail "archived runtime deletion did not fail through the canonical guard"
}
rm -f "$output"

remaining="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid and state='archived';")"
[[ "$remaining" == '1' ]] || fail "archived runtime fact was deleted or changed"

log "S14 archived runtime delete guard passed"
