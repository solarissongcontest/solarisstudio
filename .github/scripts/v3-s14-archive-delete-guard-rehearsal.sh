#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-delete-guard] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-delete-guard] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Negative-path Archive proof is destructive fixture work and must stay local.
# This rehearsal owns every fixture it asserts against. It must not depend on
# another rehearsal having run first, because that would turn a guard failure
# into an order-dependent false negative.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

EDITION_A='18910000-0000-4000-8000-000000000031'
EDITION_B='18910000-0000-4000-8000-000000000032'
SHOW_A='18910000-0000-4000-8000-000000000033'
ARCHIVE_A_OPERATION='18910000-0000-4000-8000-000000000034'
EDITION_C='18910000-0000-4000-8000-000000000021'
TELEVOTE_EDITION='18910000-0000-4000-8000-000000000022'
TELEVOTE_ROUND='18910000-0000-4000-8000-000000000023'
SUBMISSION_ROUND='18910000-0000-4000-8000-000000000024'
SUBMISSION_ID='18910000-0000-4000-8000-000000000025'
NEXT_RESPONSE='18910000-0000-4000-8000-000000000026'
FAKE_COUNTRY='18910000-0000-4000-8000-000000000027'
ARCHIVE_C_OPERATION='18910000-0000-4000-8000-000000000028'

db_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"
}

as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}

json_value() {
  local path="$1"
  python3 -c '
import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
elif isinstance(value,(dict,list)): print(json.dumps(value,separators=(",",":"),sort_keys=True))
else: print(value)
' "$path"
}

create_local_user() {
  local email="$1" display="$2" body response id
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"email_confirm":True,"user_metadata":{"display_name":sys.argv[2]}}))' "$email" "$display")"
  response="$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$body")"
  id="$(printf '%s' "$response" | json_value id 2>/dev/null || true)"
  if [[ -z "$id" ]]; then
    id="$(db_value "select id::text from auth.users where lower(email)=lower('$email') limit 1;")"
  fi
  [[ -n "$id" ]] || fail "could not create local user $email"
  printf '%s' "$id"
}

service_role_fails() {
  local label="$1" expected="$2" sql="$3" output error_line
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; $sql" \
    >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  error_line="$(grep -m1 -E '^ERROR:' "$output" || true)"
  grep -Fq "$expected" "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label did not fail through the expected canonical guard (${error_line:-no PostgreSQL error line})"
  }
  log "PASS: $label rejected by ${error_line:-$expected}"
  rm -f "$output"
}

AUTHORIZED_ID="$(create_local_user 's14-archive-delete-guard-authorized@solaris.invalid' 'S14 Archive Delete Guard Authorized')"

log "Seed independent archived/results fixtures for deletion and workflow-freeze coverage"
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
update public.studio2_platform_operational_state
set mode='normal', changed_at=now()
where singleton=true;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values
 ('$EDITION_A','S14 Archive Delete Guard A','s14-archive-delete-guard-a',1894,2026,'active',false),
 ('$EDITION_B','S14 Archive Delete Guard B','s14-archive-delete-guard-b',1895,2026,'active',false);

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values
 ('$EDITION_A','post_edition',private.studio2_default_subsystems('post_edition'),1,null),
 ('$EDITION_B','results',private.studio2_default_subsystems('results'),1,null);

insert into public.shows(id,edition_id,name,kind,sort_order,published)
values ('$SHOW_A','$EDITION_A','Archive Delete Freeze Fixture','grand-final',1,false);

insert into public.studio2_result_operations(
 show_id,edition_id,calculation_version,reviewed_version,locked_version,reveal_ready_version
) values ('$SHOW_A','$EDITION_A',1,1,1,1);

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$AUTHORIZED_ID'::uuid,'edition.manage','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.archive','$EDITION_A'::uuid);
"

as_user "$AUTHORIZED_ID" \
  "select public.studio2_transition_edition_v3('$EDITION_A'::uuid,'archived',null,null,1,'$ARCHIVE_A_OPERATION'::uuid,'s14-delete-guard-canonical-archive');" \
  >/dev/null

state="$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")"
[[ "$state" == 'archived' ]] || fail "self-owned Archive guard fixture did not archive canonically"
state_b="$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")"
[[ "$state_b" == 'results' ]] || fail "self-owned Archive guard fixture B is not in results before insert-bypass test"

log "Archived runtime row cannot be deleted by service role"
service_role_fails \
  "service-role archived runtime deletion" \
  "Archived edition runtime is irreversible." \
  "delete from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;"

remaining="$(db_value "select count(*) from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid and state='archived';")"
[[ "$remaining" == '1' ]] || fail "archived runtime fact was deleted or changed"

log "Service role cannot manufacture an archived runtime through delete + insert"
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
psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_C','S14 Archive Guard C','s14-archive-guard-c',1893,2026,'active',false);

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_C','post_edition',private.studio2_default_subsystems('post_edition'),1,null);

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
