#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-reveal-lifecycle] %s\n' "$*"; }
fail() { printf '\n[v3-reveal-lifecycle] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

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
export DATABASE_URL="$DB_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}

expect_user_failure() {
  local user_id="$1" label="$2" expected="$3" sql="$4" output
  output="$(mktemp)"
  if as_user "$user_id" "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  grep -Fq "$expected" "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label did not expose $expected"
  }
  rm -f "$output"
  log "PASS: $label rejected with $expected"
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
  [[ -n "$id" ]] || fail "could not create local user $email"
  printf '%s' "$id"
}

EDITION_A='18926000-0000-4000-8000-000000000001'
EDITION_B='18926000-0000-4000-8000-000000000002'
SHOW_A='18926000-0000-4000-8000-000000000011'
SHOW_B='18926000-0000-4000-8000-000000000012'
COUNTRY_A='18926000-0000-4000-8000-000000000021'
COUNTRY_B='18926000-0000-4000-8000-000000000022'
RESULT_A='18926000-0000-4000-8000-000000000031'
RESULT_B='18926000-0000-4000-8000-000000000032'

OP_CONFIG='18926000-0000-4000-8000-000000000101'
OP_STALE='18926000-0000-4000-8000-000000000102'
OP_UNAUTH='18926000-0000-4000-8000-000000000103'
OP_WRONG_SCOPE='18926000-0000-4000-8000-000000000104'
OP_ARM='18926000-0000-4000-8000-000000000105'
OP_DISARM='18926000-0000-4000-8000-000000000106'
OP_CONFIG_2='18926000-0000-4000-8000-000000000107'
OP_ARM_2='18926000-0000-4000-8000-000000000108'
OP_RESULT_DRIFT='18926000-0000-4000-8000-000000000109'
OP_LIVE='18926000-0000-4000-8000-000000000110'
OP_ADVANCE_1='18926000-0000-4000-8000-000000000111'
OP_ADVANCE_STALE='18926000-0000-4000-8000-000000000112'
OP_ADVANCE_2='18926000-0000-4000-8000-000000000113'
OP_COMPLETE='18926000-0000-4000-8000-000000000114'
OP_INVALID='18926000-0000-4000-8000-000000000115'

AUTHORIZED_ID="$(create_local_user 'reveal-authorized@solaris.invalid' 'Reveal Authorized')"
UNAUTHORIZED_ID="$(create_local_user 'reveal-unauthorized@solaris.invalid' 'Reveal Unauthorized')"
OTHER_EDITION_ID="$(create_local_user 'reveal-other-edition@solaris.invalid' 'Reveal Wrong Edition')"

log "Seed isolated reveal fixtures"
db_exec "
update public.studio2_platform_operational_state
set mode='normal', changed_at=now()
where singleton=true;

insert into public.countries(id,name,short_code)
values
 ('$COUNTRY_A','Reveal Alpha','RVA'),
 ('$COUNTRY_B','Reveal Beta','RVB')
on conflict (id) do nothing;

insert into public.editions(id,name,year,slug,edition_number,status,published)
values
 ('$EDITION_A','Reveal Lifecycle A',2026,'reveal-lifecycle-a',9261,'active',true),
 ('$EDITION_B','Reveal Lifecycle B',2026,'reveal-lifecycle-b',9262,'active',true)
on conflict (id) do nothing;

insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values
 ('$SHOW_A','$EDITION_A','Reveal Grand Final','grand-final',1,true,'{}'::jsonb),
 ('$SHOW_B','$EDITION_B','Other Edition Final','grand-final',1,true,'{}'::jsonb)
on conflict (id) do update
set edition_id=excluded.edition_id,published=true,updated_at=now();

insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank)
values
 ('$RESULT_A','$EDITION_A','$SHOW_A','$COUNTRY_A',12,8,20,1),
 ('$RESULT_B','$EDITION_A','$SHOW_A','$COUNTRY_B',10,6,16,2)
on conflict (id) do update
set jury_points=excluded.jury_points,televote_points=excluded.televote_points,total_points=excluded.total_points,final_rank=excluded.final_rank;

insert into public.studio2_result_operations(
 show_id,edition_id,calculation_version,reviewed_version,locked_version,reveal_ready_version
) values ('$SHOW_A','$EDITION_A',4,4,4,4)
on conflict (show_id) do update
set edition_id=excluded.edition_id,
    calculation_version=4,
    reviewed_version=4,
    locked_version=4,
    reveal_ready_version=4,
    updated_at=now();

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$AUTHORIZED_ID'::uuid,'results.preview','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'broadcast.read','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'broadcast.manage','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'broadcast.control','$EDITION_A'::uuid),
 ('$UNAUTHORIZED_ID'::uuid,'results.preview','$EDITION_A'::uuid),
 ('$OTHER_EDITION_ID'::uuid,'broadcast.control','$EDITION_B'::uuid)
on conflict do nothing;
"

[[ "$(db_value "select count(*) from public.studio2_reveal_runtime where show_id='$SHOW_A'::uuid and edition_id='$EDITION_A'::uuid and state='planning' and version=1;")" == '1' ]] || fail "show trigger/backfill did not seed Planning runtime"

log "Direct authenticated state assignment is not an authority path"
expect_user_failure "$AUTHORIZED_ID" "direct reveal table update" "permission denied" \
  "update public.studio2_reveal_runtime set state='live' where show_id='$SHOW_A'::uuid;"

log "Invalid Planning -> Live edge fails closed"
expect_user_failure "$AUTHORIZED_ID" "invalid planning to live transition" "STATE_CHANGED" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'live',null,1,'$OP_INVALID'::uuid,'reveal-invalid-edge');"

log "Save exact reveal plan"
CONFIG_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_configure_reveal_v3('$SHOW_A'::uuid,'jury_order','[\"$COUNTRY_A\",\"$COUNTRY_B\"]'::jsonb,1,'$OP_CONFIG'::uuid,'reveal-config-1');")"
[[ "$(printf '%s' "$CONFIG_JSON" | json_value state)" == 'planning' ]] || fail "plan configuration changed lifecycle unexpectedly"
[[ "$(printf '%s' "$CONFIG_JSON" | json_value version)" == '2' ]] || fail "plan configuration did not advance CAS version"

log "Unauthorized and wrong-edition actors cannot arm"
expect_user_failure "$UNAUTHORIZED_ID" "preview-only actor arming" "AUTHORIZATION" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,2,'$OP_UNAUTH'::uuid,'reveal-unauthorized-arm');"
expect_user_failure "$OTHER_EDITION_ID" "other-edition controller arming" "AUTHORIZATION" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,2,'$OP_WRONG_SCOPE'::uuid,'reveal-wrong-scope');"

log "Stale expected versions fail without a surviving processing receipt"
expect_user_failure "$AUTHORIZED_ID" "stale reveal version" "VERSION_CONFLICT" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,1,'$OP_STALE'::uuid,'reveal-stale-arm');"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OP_STALE'::uuid;")" == '0' ]] || fail "stale command left a receipt after transaction rollback"

log "Arm binds the plan to exact reveal-ready Results authority"
ARM_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,2,'$OP_ARM'::uuid,'reveal-arm-1');")"
[[ "$(printf '%s' "$ARM_JSON" | json_value state)" == 'armed' ]] || fail "arm did not reach Armed"
[[ "$(printf '%s' "$ARM_JSON" | json_value lockedResultVersion)" == '4' ]] || fail "arm did not bind result version 4"
[[ "$(printf '%s' "$ARM_JSON" | json_value version)" == '3' ]] || fail "arm did not advance runtime version"

log "Identical retry replays receipt instead of mutating twice"
ARM_REPLAY="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,2,'$OP_ARM'::uuid,'reveal-arm-1');")"
[[ "$(printf '%s' "$ARM_REPLAY" | json_value replayed)" == 'true' ]] || fail "identical arm retry was not replayed"
[[ "$(db_value "select version from public.studio2_reveal_runtime where show_id='$SHOW_A'::uuid;")" == '3' ]] || fail "replayed arm mutated runtime twice"

log "Armed plan is immutable until explicit disarm"
expect_user_failure "$AUTHORIZED_ID" "configure while armed" "STATE_CHANGED" \
  "select public.studio2_configure_reveal_v3('$SHOW_A'::uuid,'televote_ascending','[\"$COUNTRY_B\",\"$COUNTRY_A\"]'::jsonb,3,'18926000-0000-4000-8000-000000000116'::uuid,'reveal-edit-armed');"
[[ "$(as_user "$AUTHORIZED_ID" "select public.studio2_public_reveal_snapshot('$SHOW_A'::uuid)->>'state';")" == 'hidden' ]] || fail "Armed state leaked through public reveal projection"

log "Explicit disarm returns to editable Rehearsal"
DISARM_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'rehearsal','Need to replace reveal order',3,'$OP_DISARM'::uuid,'reveal-disarm-1');")"
[[ "$(printf '%s' "$DISARM_JSON" | json_value state)" == 'rehearsal' ]] || fail "disarm did not return to Rehearsal"
[[ "$(printf '%s' "$DISARM_JSON" | json_value lockedResultVersion)" == '' ]] || fail "disarm did not release result lock binding"

log "Reconfigure, re-arm and prove stale Result authority blocks Live"
CONFIG2_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_configure_reveal_v3('$SHOW_A'::uuid,'televote_ascending','[\"$COUNTRY_B\",\"$COUNTRY_A\"]'::jsonb,4,'$OP_CONFIG_2'::uuid,'reveal-config-2');")"
[[ "$(printf '%s' "$CONFIG2_JSON" | json_value version)" == '5' ]] || fail "second plan configuration did not advance version"
ARM2_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'armed',null,5,'$OP_ARM_2'::uuid,'reveal-arm-2');")"
[[ "$(printf '%s' "$ARM2_JSON" | json_value version)" == '6' ]] || fail "second arm did not advance version"

db_exec "update public.studio2_result_operations set calculation_version=5,reviewed_version=5,locked_version=5,reveal_ready_version=5,updated_at=now() where show_id='$SHOW_A'::uuid;"
expect_user_failure "$AUTHORIZED_ID" "live after result authority drift" "VERSION_CONFLICT" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'live',null,6,'$OP_RESULT_DRIFT'::uuid,'reveal-result-drift');"
db_exec "update public.studio2_result_operations set calculation_version=4,reviewed_version=4,locked_version=4,reveal_ready_version=4,updated_at=now() where show_id='$SHOW_A'::uuid;"

log "Enter Live and expose only bounded public progress"
LIVE_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'live',null,6,'$OP_LIVE'::uuid,'reveal-live-1');")"
[[ "$(printf '%s' "$LIVE_JSON" | json_value state)" == 'live' ]] || fail "Armed -> Live failed"
PUBLIC_LIVE="$(as_user "$UNAUTHORIZED_ID" "select public.studio2_public_reveal_snapshot('$SHOW_A'::uuid);")"
[[ "$(printf '%s' "$PUBLIC_LIVE" | json_value state)" == 'live' ]] || fail "public projection did not expose Live state"
[[ "$(printf '%s' "$PUBLIC_LIVE" | json_value currentStep)" == '0' ]] || fail "public Live progress should begin at zero"
[[ "$PUBLIC_LIVE" != *'sequence'* && "$PUBLIC_LIVE" != *'points'* ]] || fail "public projection leaked future sequence or result points"

log "Advance is atomic, replay-safe and public only after the step happened"
ADVANCE1_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_advance_reveal_v3('$SHOW_A'::uuid,7,'$OP_ADVANCE_1'::uuid,'reveal-advance-1');")"
[[ "$(printf '%s' "$ADVANCE1_JSON" | json_value currentStep)" == '1' ]] || fail "first advance did not reach step 1"
[[ "$(printf '%s' "$ADVANCE1_JSON" | json_value revealedId)" == "$COUNTRY_B" ]] || fail "first advance revealed wrong locked identity"
PUBLIC_STEP1="$(as_user "$UNAUTHORIZED_ID" "select public.studio2_public_reveal_snapshot('$SHOW_A'::uuid);")"
[[ "$(printf '%s' "$PUBLIC_STEP1" | json_value lastRevealedId)" == "$COUNTRY_B" ]] || fail "public projection did not expose already-revealed identity"

ADVANCE1_REPLAY="$(as_user "$AUTHORIZED_ID" "select public.studio2_advance_reveal_v3('$SHOW_A'::uuid,7,'$OP_ADVANCE_1'::uuid,'reveal-advance-1');")"
[[ "$(printf '%s' "$ADVANCE1_REPLAY" | json_value replayed)" == 'true' ]] || fail "advance retry did not replay"
[[ "$(db_value "select current_step from public.studio2_reveal_runtime where show_id='$SHOW_A'::uuid;")" == '1' ]] || fail "advance replay duplicated a reveal step"

expect_user_failure "$AUTHORIZED_ID" "stale advance" "VERSION_CONFLICT" \
  "select public.studio2_advance_reveal_v3('$SHOW_A'::uuid,7,'$OP_ADVANCE_STALE'::uuid,'reveal-advance-stale');"

ADVANCE2_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_advance_reveal_v3('$SHOW_A'::uuid,8,'$OP_ADVANCE_2'::uuid,'reveal-advance-2');")"
[[ "$(printf '%s' "$ADVANCE2_JSON" | json_value currentStep)" == '2' ]] || fail "second advance did not finish locked sequence"

log "Complete only after every locked reveal step"
COMPLETE_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'complete',null,9,'$OP_COMPLETE'::uuid,'reveal-complete-1');")"
[[ "$(printf '%s' "$COMPLETE_JSON" | json_value state)" == 'complete' ]] || fail "Live -> Complete failed"
[[ "$(as_user "$UNAUTHORIZED_ID" "select public.studio2_public_reveal_snapshot('$SHOW_A'::uuid)->>'state';")" == 'complete' ]] || fail "public projection did not expose Complete state"
expect_user_failure "$AUTHORIZED_ID" "complete state reversal" "STATE_CHANGED" \
  "select public.studio2_transition_reveal_v3('$SHOW_A'::uuid,'rehearsal','try reversal',10,'18926000-0000-4000-8000-000000000117'::uuid,'reveal-complete-reversal');"

log "Organizer readback and event/receipt evidence agree with canonical runtime"
SNAPSHOT="$(as_user "$AUTHORIZED_ID" "select public.studio2_reveal_director_snapshot('$EDITION_A'::uuid);")"
[[ "$(printf '%s' "$SNAPSHOT" | json_value 0.state)" == 'complete' ]] || fail "Organizer snapshot disagrees with canonical Complete runtime"
[[ "$(printf '%s' "$SNAPSHOT" | json_value 0.currentStep)" == '2' ]] || fail "Organizer snapshot progress disagrees with canonical runtime"
[[ "$(db_value "select count(*) from private.v3_domain_events where show_id='$SHOW_A'::uuid and event_type='show.changed';")" -ge '5' ]] || fail "Reveal lifecycle did not persist show.changed DomainEvents"
[[ "$(db_value "select count(*) from private.v3_domain_events where show_id='$SHOW_A'::uuid and event_type='show.cue_changed';")" == '2' ]] || fail "Reveal advances did not persist exactly two cue DomainEvents"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$AUTHORIZED_ID'::uuid and command like 'show.reveal.%' and status='succeeded';")" -ge '9' ]] || fail "Reveal commands lack durable succeeded operation receipts"

log "Reveal Director governed lifecycle rehearsal passed"
