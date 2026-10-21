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
EDITION_C='18910000-0000-4000-8000-000000000021'
TELEVOTE_EDITION='18910000-0000-4000-8000-000000000022'
TELEVOTE_ROUND='18910000-0000-4000-8000-000000000023'
SUBMISSION_ROUND='18910000-0000-4000-8000-000000000024'
SUBMISSION_ID='18910000-0000-4000-8000-000000000025'
NEXT_RESPONSE='18910000-0000-4000-8000-000000000026'
FAKE_COUNTRY='18910000-0000-4000-8000-000000000027'
ARCHIVE_C_OPERATION='18910000-0000-4000-8000-000000000028'

state="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")"
[[ "$state" == 'archived' ]] || fail "Archive guard fixture is not archived before delete test"

db_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

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
  log "PASS: $label failed through $expected"
}

as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}

log "Archived runtime row cannot be deleted by service role"
service_role_fails \
  "service-role archived runtime deletion" \
  "Archived edition runtime is irreversible." \
  "delete from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;"

remaining="$(db_value "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid and state='archived';")"
[[ "$remaining" == '1' ]] || fail "archived runtime fact was deleted or changed"

log "Service role cannot manufacture an archived runtime through delete + insert"
state_b="$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")"
[[ "$state_b" == 'results' ]] || fail "Archive guard fixture B is not in results before insert-bypass test"

# Use the deleted row's own subsystems payload. Calling a private helper while
# impersonating service_role can fail at the private-schema permission boundary
# before the runtime INSERT reaches the Archive trigger, which would be a false
# negative for the invariant this rehearsal exists to prove.
service_role_fails \
  "service-role direct archived runtime insertion" \
  "Archive transition must use the canonical V3 lifecycle command." \
  "begin; with deleted as (delete from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid returning edition_id,subsystems) insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by) select edition_id,'archived',subsystems,6,null from deleted; commit;"

state_b="$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")"
[[ "$state_b" == 'results' ]] || fail "failed archived insert did not roll back the fixture runtime atomically"

log "Archive freezes publication, result-operation and legacy lifecycle mutation boundaries"
SHOW_A="$(db_value "select id::text from public.shows where edition_id='$EDITION_A'::uuid order by id limit 1;")"
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

legacy_status="$(db_value "select status from public.editions where id='$EDITION_A'::uuid;")"
[[ "$legacy_status" == 'completed' || "$legacy_status" == 'finished' ]] || fail "archived edition compatibility status is not terminal"

log "Seed one independent current-workflow edition for terminal-boundary coverage"
AUTHORIZED_ID="$(db_value "select id::text from auth.users where lower(email)='s14-archive-guards-authorized@solaris.invalid' limit 1;")"
[[ -n "$AUTHORIZED_ID" ]] || fail "Archive guard operator fixture is missing"

psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_C','S14 Archive Guard C','s14-archive-guard-c',1893,2026,'active',false);

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
select '$EDITION_C'::uuid,'post_edition',runtime.subsystems,1,null
from public.studio2_edition_runtime runtime
where runtime.edition_id='$EDITION_B'::uuid;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$AUTHORIZED_ID'::uuid,'edition.manage','$EDITION_C'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.archive','$EDITION_C'::uuid)
on conflict do nothing;

insert into public.submission_rounds(id,edition_id,name,status)
values ('$SUBMISSION_ROUND','$EDITION_C','Archive terminal fixture','closed');

insert into public.submissions(
 id,edition_id,round_id,instagram_username,country,participating,selection_method
) values (
 '$SUBMISSION_ID','$EDITION_C','$SUBMISSION_ROUND','archive_fixture','Archive Fixture',true,'internal'
);

insert into public.next_in_line_responses(
 id,source_submission_id,edition_id,country,participating,selection_type
) values (
 '$NEXT_RESPONSE','$SUBMISSION_ID','$EDITION_C','Archive Fixture',true,'internal'
);

insert into public.studio2_next_in_line_windows(
 edition_id,enabled,status,version,reason
) values ('$EDITION_C',false,'closed',1,'Archive terminal fixture');

insert into televoting.editions(id,name,is_active,is_archived)
values ('$TELEVOTE_EDITION','S14 Archive Televote',false,false);

insert into televoting.rounds(id,edition_id,name,status)
values ('$TELEVOTE_ROUND','$TELEVOTE_EDITION','Archive terminal round','closed');

insert into public.televoting_round_bindings(
 remote_round_id,remote_edition_id,edition_id,source_mode
) values ('$TELEVOTE_ROUND','$TELEVOTE_EDITION','$EDITION_C','edition');
"

[[ "$(db_value "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_C'::uuid and state='post_edition' and version=1;")" == '1' ]] || fail "terminal-boundary fixture runtime was not created with valid subsystem state"

as_user "$AUTHORIZED_ID" \
  "select public.studio2_transition_edition_v3('$EDITION_C'::uuid,'archived',null,null,1,'$ARCHIVE_C_OPERATION'::uuid,'s14-terminal-boundary-archive');" \
  >/dev/null
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_C'::uuid;")" == 'archived' ]] || fail "terminal-boundary fixture did not archive canonically"

log "Archive freezes remaining Next in Line and eligibility stores"
service_role_fails \
  "archived Next in Line window mutation" \
  "Archived edition workflow is read-only." \
  "update public.studio2_next_in_line_windows set enabled=true,status='open' where edition_id='$EDITION_C'::uuid;"

service_role_fails \
  "archived Next in Line response mutation" \
  "Archived edition workflow is read-only." \
  "update public.next_in_line_responses set participating=false where id='$NEXT_RESPONSE'::uuid;"

service_role_fails \
  "archived eligibility override insertion" \
  "Archived edition workflow is read-only." \
  "insert into public.studio2_eligibility_overrides(edition_id,country_id,affected_rule,reason) values ('$EDITION_C'::uuid,'$FAKE_COUNTRY'::uuid,'archive.fixture','Archive fixture must fail closed');"

log "Archive freezes Televote binding and canonical Televote round storage"
service_role_fails \
  "archived Televote binding mutation" \
  "Archived edition workflow is read-only." \
  "update public.televoting_round_bindings set source_mode='show' where remote_round_id='$TELEVOTE_ROUND';"

service_role_fails \
  "archived canonical Televote round mutation" \
  "Archived edition workflow is read-only." \
  "update televoting.rounds set closes_at=now() + interval '1 hour' where id='$TELEVOTE_ROUND'::uuid;"

[[ "$(db_value "select status::text from televoting.rounds where id='$TELEVOTE_ROUND'::uuid;")" == 'closed' ]] || fail "archived Televote mutation changed canonical round state"
[[ "$(db_value "select status from public.studio2_next_in_line_windows where edition_id='$EDITION_C'::uuid;")" == 'closed' ]] || fail "archived Next in Line mutation changed canonical window state"
[[ "$(db_value "select participating::text from public.next_in_line_responses where id='$NEXT_RESPONSE'::uuid;")" == 'true' ]] || fail "archived Next in Line response mutation changed retained response"

log "S14 Archive irreversibility + workflow-freeze guards passed"
