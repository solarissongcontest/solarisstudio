#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-guards] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-guards] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Negative-path archive proof is destructive fixture work and must stay local.
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

as_service() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; $sql"
}

expect_service_failure() {
  local label="$1" expected="$2" sql="$3" output
  output="$(mktemp)"
  if as_service "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  grep -Fq "$expected" "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label did not fail through the archive guard"
  }
  rm -f "$output"
  log "PASS: $label failed closed"
}


# Prove both layers independently: API roles cannot reach table DML at all;
# the database owner can reach it, but cannot bypass the Archive invariant.
expect_runtime_authority_failure() {
  local label="$1" expected="$2" sql="$3" output
  expect_service_failure "$label (service privilege boundary)" "permission denied for table studio2_edition_runtime" "$sql"
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label bypassed the Archive invariant as database owner"
  fi
  grep -Fq "$expected" "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label did not expose the specific Archive invariant"
  }
  rm -f "$output"
  log "PASS: $label denied independently by privilege and Archive invariant"
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

EDITION_A='18910000-0000-4000-8000-000000000001'
EDITION_B='18910000-0000-4000-8000-000000000002'
INCIDENT_ID='18910000-0000-4000-8000-000000000003'
BLOCKER_ID='18910000-0000-4000-8000-000000000004'
SHOW_A='18910000-0000-4000-8000-000000000005'
STALE_OPERATION='18910000-0000-4000-8000-000000000010'
INVALID_OPERATION='18910000-0000-4000-8000-000000000011'
UNAUTHORIZED_OPERATION='18910000-0000-4000-8000-000000000012'
ARCHIVE_OPERATION='18910000-0000-4000-8000-000000000013'

AUTHORIZED_ID="$(create_local_user 's14-archive-guards-authorized@solaris.invalid' 'S14 Archive Guard Authorized')"
UNAUTHORIZED_ID="$(create_local_user 's14-archive-guards-unauthorized@solaris.invalid' 'S14 Archive Guard Unauthorized')"

log "Seed independent lifecycle, canonical blocker and governance fixtures"
db_exec "
update public.studio2_platform_operational_state
set mode='normal', changed_at=now()
where singleton=true;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values
 ('$EDITION_A','S14 Archive Guard A','s14-archive-guard-a',1891,2026,'active',false),
 ('$EDITION_B','S14 Archive Guard B','s14-archive-guard-b',1892,2026,'active',false)
on conflict (id) do nothing;

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values
 ('$EDITION_A','post_edition',private.studio2_default_subsystems('post_edition'),3,null),
 ('$EDITION_B','results',private.studio2_default_subsystems('results'),5,null)
on conflict (edition_id) do update
set state=excluded.state,subsystems=excluded.subsystems,version=excluded.version,updated_by=null;

-- Concrete current-workflow rows let the follow-up freeze rehearsal prove that
-- Archive blocks real updates rather than only synthetic inserts that would
-- otherwise fail later FK/NOT NULL checks.
insert into public.shows(id,edition_id,name,kind,sort_order,published)
values ('$SHOW_A','$EDITION_A','Archive Freeze Fixture','grand-final',1,false)
on conflict (id) do update
set edition_id=excluded.edition_id,name=excluded.name,published=false,updated_at=now();

insert into public.studio2_result_operations(
 show_id,edition_id,calculation_version,reviewed_version,locked_version,reveal_ready_version
) values ('$SHOW_A','$EDITION_A',1,1,1,1)
on conflict (show_id) do update
set edition_id=excluded.edition_id,
    calculation_version=1,
    reviewed_version=1,
    locked_version=1,
    reveal_ready_version=1,
    updated_at=now();

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$AUTHORIZED_ID'::uuid,'edition.manage','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.archive','$EDITION_A'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.manage','$EDITION_B'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.archive','$EDITION_B'::uuid),
 ('$UNAUTHORIZED_ID'::uuid,'edition.manage','$EDITION_A'::uuid)
on conflict do nothing;

insert into public.studio2_incidents(
 id,edition_id,title,severity,status,created_by,updated_by
) values (
 '$INCIDENT_ID','$EDITION_A','Archive must preserve governance work','sev2','detected',
 '$AUTHORIZED_ID'::uuid,'$AUTHORIZED_ID'::uuid
)
on conflict (id) do update
set status='detected',resolved_at=null,updated_at=now();

select private.studio2_reconcile_all_organizer_tasks('$EDITION_A'::uuid);

-- Seed the canonical S1 Edition task vocabulary explicitly. Assign it to the
-- capable fixture operator so the real task notification synchronizer creates
-- both Inbox and delivery projections before Archive.
insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$BLOCKER_ID','$EDITION_A','$AUTHORIZED_ID'::uuid,'edition','archive-guard-blocker',
 'v3-s14-archive-guard:edition-blocker','edition.blocker','edition.manage',
 'high','open','Canonical edition blocker must end at Archive',
 'Synthetic canonical Edition task used only by the isolated S14 guard rehearsal.',
 '/admin/control-room','{}'::jsonb
)
on conflict (source_key) do update
set assigned_to=excluded.assigned_to,
    state='open',resolved_at=null,last_evaluated_at=now(),updated_at=now();

select private.studio2_sync_task_notifications('$EDITION_A'::uuid);
"

[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "incident governance task was not created"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'open' ]] || fail "canonical edition.blocker fixture was not open before archive"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='v3-s14-archive-guard:edition-blocker' and resolution_mode='domain' and requires_action and resolved_at is null;")" == '1' ]] || fail "canonical edition.blocker Inbox projection was not actionable before archive"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status in ('pending','processing');")" -ge '1' ]] || fail "canonical edition.blocker delivery projection was not pending before archive"

log "Archive capability is mandatory"
expect_user_failure "$UNAUTHORIZED_ID" "archive without edition.archive" "AUTHORIZATION" \
  "select public.studio2_transition_edition_v3('$EDITION_A'::uuid,'archived',null,null,3,'$UNAUTHORIZED_OPERATION'::uuid,'s14-guard-unauthorized');"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")" == 'post_edition' ]] || fail "unauthorized archive changed runtime"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'open' ]] || fail "failed archive resolved edition.blocker prematurely"

log "Stale runtime versions fail closed"
expect_user_failure "$AUTHORIZED_ID" "archive with stale expected version" "VERSION_CONFLICT" \
  "select public.studio2_transition_edition_v3('$EDITION_A'::uuid,'archived',null,null,2,'$STALE_OPERATION'::uuid,'s14-guard-stale');"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$STALE_OPERATION'::uuid;")" == '0' ]] || fail "failed stale transition left a processing receipt"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'open' ]] || fail "stale archive resolved edition.blocker prematurely"

log "Archive cannot skip post_edition"
expect_user_failure "$AUTHORIZED_ID" "results directly to archived" "STATE_CHANGED" \
  "select public.studio2_transition_edition_v3('$EDITION_B'::uuid,'archived',null,null,5,'$INVALID_OPERATION'::uuid,'s14-guard-invalid-source');"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")" == 'results' ]] || fail "invalid archive source changed runtime"

log "Unguarded direct runtime Archive SQL fails closed"
expect_runtime_authority_failure "direct runtime archive mutation" "Archive transition must use the canonical V3 lifecycle command" \
  "update public.studio2_edition_runtime set state='archived' where edition_id='$EDITION_B'::uuid;"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")" == 'results' ]] || fail "direct SQL bypassed archive guard"

log "Caller-controlled settings cannot forge canonical Archive authority"
expect_runtime_authority_failure "caller-controlled archive guard setting" "Archive transition must use the canonical V3 lifecycle command" \
  "begin; select set_config('solaris.v3_archive_command','allowed',true); update public.studio2_edition_runtime set state='archived' where edition_id='$EDITION_B'::uuid; commit;"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_B'::uuid;")" == 'results' ]] || fail "caller-controlled setting bypassed archive guard"

log "Canonical archive resolves Edition blocker while governance work remains actionable"
ARCHIVE_JSON="$(as_user "$AUTHORIZED_ID" "select public.studio2_transition_edition_v3('$EDITION_A'::uuid,'archived',null,null,3,'$ARCHIVE_OPERATION'::uuid,'s14-guard-canonical-archive');")"
[[ "$(printf '%s' "$ARCHIVE_JSON" | json_value state)" == 'archived' ]] || fail "canonical archive did not reach archived"
as_service "select private.studio2_reconcile_all_organizer_tasks('$EDITION_A'::uuid);" >/dev/null
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "archive left canonical edition.blocker actionable"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='v3-s14-archive-guard:edition-blocker' and resolution_mode='domain' and not requires_action and resolved_at is not null;")" == '1' ]] || fail "archive left edition.blocker Inbox projection actionable"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status in ('pending','processing');")" == '0' ]] || fail "archive left edition.blocker push delivery claimable"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "archive incorrectly resolved legitimate incident governance work"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid and status='detected';")" == '1' ]] || fail "archive mutated incident history/state"

log "Archived runtime cannot be directly moved back into active lifecycle state"
expect_runtime_authority_failure "direct archived runtime reversal" "Archived edition runtime is read-only" \
  "update public.studio2_edition_runtime set state='post_edition' where edition_id='$EDITION_A'::uuid;"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_A'::uuid;")" == 'archived' ]] || fail "direct SQL reversed an archived runtime"

expect_runtime_authority_failure "archived runtime metadata rewrite" "Archived edition runtime is read-only" \
  "update public.studio2_edition_runtime set updated_by='$UNAUTHORIZED_ID'::uuid where edition_id='$EDITION_A'::uuid;"

ARCHIVED_TASK_RESOLVED_AT="$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")"
expect_service_failure "archived task history rewrite" "Archived edition workflow task history is read-only" \
  "update public.studio2_organizer_tasks set resolved_at=null where id='$BLOCKER_ID'::uuid;"
[[ "$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == "$ARCHIVED_TASK_RESOLVED_AT" ]] || fail "archive task guard rewrote retained resolution timestamp"

log "S14 archive negative-path rehearsal passed"
