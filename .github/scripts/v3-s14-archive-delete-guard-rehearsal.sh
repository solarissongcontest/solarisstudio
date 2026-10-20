#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-delete-guard] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-delete-guard] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This script runs immediately after the main Archive guard rehearsal, which
# leaves EDITION_A in canonical archived state and EDITION_B in results. It
# proves privileged callers cannot delete/manufacture Archive state, mutate
# current-workflow history after Archive, or revive the legacy public lifecycle.
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
EDITION_B='18910000-0000-4000-8000-000000000002'
state="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")"
[[ "$state" == 'archived' ]] || fail "Archive guard fixture is not archived before delete test"

service_role_fails() {
  local label="$1" expected="$2" sql="$3" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; $sql" \
    >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  grep -Fq "$expected" "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label did not fail through the expected canonical guard"
  }
  rm -f "$output"
}

log "Archived runtime row cannot be deleted by service role"
service_role_fails \
  "service-role archived runtime deletion" \
  "Archived edition runtime is irreversible." \
  "delete from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;"

remaining="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid and state='archived';")"
[[ "$remaining" == '1' ]] || fail "archived runtime fact was deleted or changed"

log "Service role cannot manufacture an archived runtime through delete + insert"
state_b="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")"
[[ "$state_b" == 'results' ]] || fail "Archive guard fixture B is not in results before insert-bypass test"

service_role_fails \
  "service-role direct archived runtime insertion" \
  "Archive transition must use the canonical V3 lifecycle command." \
  "begin; delete from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid; insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by) values ('$EDITION_B'::uuid,'archived',private.studio2_default_subsystems('archived'),6,null); commit;"

state_b="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")"
[[ "$state_b" == 'results' ]] || fail "failed archived insert did not roll back the fixture runtime atomically"

log "Archive freezes publication, result-operation and legacy lifecycle mutation boundaries"
SHOW_A="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select id::text from public.shows where edition_id='$EDITION_A'::uuid order by id limit 1;")"
[[ -n "$SHOW_A" ]] || fail "Archive guard fixture has no show for workflow-freeze tests"

service_role_fails \
  "archived show publication mutation" \
  "Archived edition workflow is read-only." \
  "update public.shows set published=false where id='$SHOW_A'::uuid;"

service_role_fails \
  "archived result operation mutation" \
  "Archived edition workflow is read-only." \
  "update public.studio2_result_operations set locked_version=null where show_id='$SHOW_A'::uuid;"

service_role_fails \
  "archived legacy lifecycle revival" \
  "Archived edition lifecycle is read-only." \
  "update public.editions set status='active' where id='$EDITION_A'::uuid;"

legacy_status="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select status from public.editions where id='$EDITION_A'::uuid;")"
[[ "$legacy_status" == 'completed' || "$legacy_status" == 'finished' ]] || fail "archived edition compatibility status is not terminal"

log "S14 Archive irreversibility + workflow-freeze guards passed"
