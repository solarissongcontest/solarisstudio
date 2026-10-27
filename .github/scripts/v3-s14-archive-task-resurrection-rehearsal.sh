#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-task-invariant] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-task-invariant] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This verifier owns every fixture it asserts against. It intentionally performs
# destructive/server-side projection writes, so it must remain local-only.
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

# Normalize the full verification identity before the fail-closed isolation
# guard. CI may inherit hosted project refs even when the running Supabase URLs
# are loopback; this verifier must be self-contained and explicitly local.
export DATABASE_URL="$DB_URL" POSTGRES_URL="$DB_URL" SUPABASE_DB_URL="$DB_URL"
export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local E2E_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}

as_service() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; $sql"
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

new_uuid() {
  python3 -c 'import uuid; print(uuid.uuid4())'
}

RUN_TOKEN="$(new_uuid)"
EDITION_ID="$(new_uuid)"
INCIDENT_ID="$(new_uuid)"
BLOCKER_ID="$(new_uuid)"
NEW_TASK_ID="$(new_uuid)"
ARCHIVE_OPERATION="$(new_uuid)"
EDITION_NUMBER="$(python3 -c 'import sys,uuid; print(100000 + (int(uuid.UUID(sys.argv[1]).hex[:8],16) % 800000))' "$EDITION_ID")"
BLOCKER_SOURCE_KEY="v3-s14-archive-task-${RUN_TOKEN}:edition-blocker"
NEW_TASK_SOURCE_KEY="v3-s14-archive-task-${RUN_TOKEN}:post-archive-results"
PENDING_DEDUPE_PREFIX="s14-archive-preserve-pending-${RUN_TOKEN}"
FAILED_ERROR='S14 preserved failed delivery evidence'
AUTHORIZED_ID="$(create_local_user "s14-archive-task-${RUN_TOKEN}@solaris.invalid" 'S14 Archive Task Invariant')"

log "Seed independent lifecycle, blocker, governance and notification fixtures"
db_exec "
update public.studio2_platform_operational_state
set mode='normal', changed_at=now()
where singleton=true;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values (
 '$EDITION_ID',
 'S14 Archive Task Invariant',
 's14-archive-task-$RUN_TOKEN',
 $EDITION_NUMBER,
 2026,
 'active',
 false
);

-- public.editions owns canonical runtime creation. Prepare that generated row
-- for the legal post_edition -> archived transition rather than double-inserting
-- a second runtime fixture.
update public.studio2_edition_runtime
set state='post_edition',
    subsystems=private.studio2_default_subsystems('post_edition'),
    version=1,
    updated_by=null
where edition_id='$EDITION_ID'::uuid;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$AUTHORIZED_ID'::uuid,'edition.manage','$EDITION_ID'::uuid),
 ('$AUTHORIZED_ID'::uuid,'edition.archive','$EDITION_ID'::uuid)
on conflict do nothing;

insert into public.studio2_incidents(
 id,edition_id,title,severity,status,created_by,updated_by
) values (
 '$INCIDENT_ID','$EDITION_ID','Archive must preserve governance work','sev2','detected',
 '$AUTHORIZED_ID'::uuid,'$AUTHORIZED_ID'::uuid
);

select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);

insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$BLOCKER_ID','$EDITION_ID','$AUTHORIZED_ID'::uuid,'edition','archive-task-invariant-blocker',
 '$BLOCKER_SOURCE_KEY','edition.blocker','edition.manage',
 'high','open','Canonical edition blocker must end at Archive',
 'Synthetic canonical Edition task used only by the isolated S14 task invariant rehearsal.',
 '/admin/control-room','{}'::jsonb
);

select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);
"

[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'post_edition' ]] || fail "self-contained task fixture runtime was not prepared in post_edition"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "incident governance task was not created"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'open' ]] || fail "canonical edition.blocker fixture was not open before archive"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='$BLOCKER_SOURCE_KEY' and resolution_mode='domain' and requires_action and resolved_at is null;")" == '1' ]] || fail "canonical edition.blocker Inbox projection was not actionable before archive"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status in ('pending','processing');")" -ge '1' ]] || fail "canonical edition.blocker delivery projection was not pending before archive"

log "Archive the self-contained fixture through the canonical lifecycle command"
as_user "$AUTHORIZED_ID" \
  "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'archived',null,null,1,'$ARCHIVE_OPERATION'::uuid,'s14-task-invariant-archive-$RUN_TOKEN');" \
  >/dev/null
as_service "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);" >/dev/null

[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'archived' ]] || fail "self-contained fixture did not reach archived through canonical lifecycle command"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "archive left canonical edition.blocker actionable"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='$BLOCKER_SOURCE_KEY' and not requires_action and resolved_at is not null;")" == '1' ]] || fail "archive did not leave the blocker Inbox projection resolved"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "archive incorrectly resolved legitimate incident governance work"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid and status='detected';")" == '1' ]] || fail "archive mutated incident history/state"

log "Poison the resolved notification projection with one pending attempt and one retained failed attempt"
db_exec "
update public.notification_deliveries
set status='failed', processing_started_at=null, error='$FAILED_ERROR'
where subject_id='$BLOCKER_ID'
  and category='organizer_tasks';

insert into public.notification_deliveries(
  user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
  '$AUTHORIZED_ID'::uuid,'organizer_tasks','organizer_task.high','$BLOCKER_ID',
  '$PENDING_DEDUPE_PREFIX','/admin/results','Pending task push','S14 pending suppression fixture',now(),'pending'
)
on conflict (user_id,dedupe_key) do update
set status='pending',processing_started_at=null,error=null;

-- Poison Inbox last. The clean migration chain now has delivery-side repair
-- hooks that correctly re-project resolved Task state while delivery fixtures are
-- being changed. This rehearsal needs a deliberately corrupted present-tense
-- Inbox projection after those hooks have run so the explicit convergence path
-- below is actually exercised rather than having its fixture repaired early.
update public.admin_notifications
set resolved_at=null, requires_action=true
where recipient_id='$AUTHORIZED_ID'::uuid
  and source_key='$BLOCKER_SOURCE_KEY';
"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='$BLOCKER_SOURCE_KEY' and requires_action and resolved_at is null;")" == '1' ]] || fail "could not poison blocker Inbox projection for invariant rehearsal"

# Organizer delivery identity is versioned by the canonical BEFORE INSERT trigger
# studio2_version_organizer_delivery_dedupe. Capture the actual persisted key
# instead of asserting against the caller-supplied pre-trigger prefix.
PENDING_DEDUPE="$(db_value "select dedupe_key from public.notification_deliveries where user_id='$AUTHORIZED_ID'::uuid and subject_id='$BLOCKER_ID' and category='organizer_tasks' and dedupe_key ~ '^${PENDING_DEDUPE_PREFIX}:activation-[0-9]+$' order by scheduled_for desc, created_at desc limit 1;")"
[[ -n "$PENDING_DEDUPE" ]] || fail "could not resolve activation-versioned pending blocker delivery identity"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$AUTHORIZED_ID'::uuid and dedupe_key='$PENDING_DEDUPE' and status='pending';")" == '1' ]] || fail "could not create pending blocker delivery projection for invariant rehearsal"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status='failed' and error='$FAILED_ERROR';")" -ge '1' ]] || fail "could not create retained failed-delivery evidence fixture"

RESOLVED_AT_BEFORE="$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")"
[[ -n "$RESOLVED_AT_BEFORE" ]] || fail "archived blocker lacks a resolution timestamp before resurrection attempt"

log "Archived resolved Task history rejects direct resurrection rewrites"
REWRITE_OUTPUT="$(mktemp)"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "
update public.studio2_organizer_tasks
set state='open', resolved_at=null, updated_at=now()
where id='$BLOCKER_ID'::uuid;
" >"$REWRITE_OUTPUT" 2>&1; then
  cat "$REWRITE_OUTPUT" >&2
  rm -f "$REWRITE_OUTPUT"
  fail "archived edition.blocker rewrite unexpectedly succeeded"
fi
grep -Fq 'Archived edition workflow task history is read-only.' "$REWRITE_OUTPUT" || {
  cat "$REWRITE_OUTPUT" >&2
  rm -f "$REWRITE_OUTPUT"
  fail "archived task rewrite did not fail through the historical-evidence guard"
}
rm -f "$REWRITE_OUTPUT"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "archived edition.blocker was resurrected"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid and resolved_at is not null;")" == '1' ]] || fail "resurrection guard did not retain blocker resolution evidence"
[[ "$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == "$RESOLVED_AT_BEFORE" ]] || fail "resurrection guard rewrote historical blocker resolution timestamp"

log "Canonical aggregate reconciliation converges repeatedly after Archive"
db_exec "
set role service_role;
set request.jwt.claims = '{\"role\":\"service_role\"}';
select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);
select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);
"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "aggregate reconciliation reopened archived edition.blocker"
[[ "$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == "$RESOLVED_AT_BEFORE" ]] || fail "aggregate reconciliation rewrote archived blocker resolution timestamp"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "aggregate reconciliation suppressed legitimate incident governance work"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid and status='detected';")" == '1' ]] || fail "aggregate reconciliation mutated incident domain state"

# Reassert the already-terminal state without changing historical domain fields.
# The Archive guard explicitly permits housekeeping timestamp updates on a
# resolved row; including state/resolved_at in this no-op UPDATE exercises the
# resolved-task projection trigger so poisoned present-tense notification state
# is repaired without reopening or rewriting retained Task history.
db_exec "
update public.studio2_organizer_tasks
set state='resolved', resolved_at=resolved_at, updated_at=now()
where id='$BLOCKER_ID'::uuid;
"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "terminal task projection touch changed blocker state"
[[ "$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == "$RESOLVED_AT_BEFORE" ]] || fail "terminal task projection touch changed historical resolution timestamp"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='$BLOCKER_SOURCE_KEY' and not requires_action and resolved_at is not null;")" == '1' ]] || fail "task resolution did not immediately repair poisoned Inbox action state"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$AUTHORIZED_ID'::uuid and dedupe_key='$PENDING_DEDUPE' and status='suppressed';")" == '1' ]] || fail "task resolution did not immediately suppress pending delivery state"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status='failed' and error='$FAILED_ERROR';")" -ge '1' ]] || fail "task resolution rewrote historical failed-delivery evidence"

log "Archived current-workflow Task evidence cannot be deleted"
DELETE_OUTPUT="$(mktemp)"
if psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "delete from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;" >"$DELETE_OUTPUT" 2>&1; then
  cat "$DELETE_OUTPUT" >&2
  rm -f "$DELETE_OUTPUT"
  fail "archived current-workflow task evidence was deletable"
fi
grep -Fq 'Archived edition workflow task history is read-only.' "$DELETE_OUTPUT" || {
  cat "$DELETE_OUTPUT" >&2
  rm -f "$DELETE_OUTPUT"
  fail "archived task deletion did not fail through the historical-evidence guard"
}
rm -f "$DELETE_OUTPUT"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid and state='resolved' and resolved_at is not null;")" == '1' ]] || fail "archived task deletion attempt changed historical task evidence"

log "Attempt to create new impossible current-contest work after Archive"
db_exec "
insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$NEW_TASK_ID','$EDITION_ID','$AUTHORIZED_ID'::uuid,'result_operation','post-archive-fixture',
 '$NEW_TASK_SOURCE_KEY','results.blocked','edition.manage',
 'high','open','Post-Archive results work must not become actionable',
 'Synthetic post-Archive task used only by the isolated S14 invariant rehearsal.',
 '/admin/results','{}'::jsonb
)
on conflict (id) do update
set edition_id=excluded.edition_id,
    assigned_to=excluded.assigned_to,
    task_type=excluded.task_type,
    state='open',
    resolved_at=null,
    updated_at=now();

select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);
"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$NEW_TASK_ID'::uuid;")" == 'resolved' ]] || fail "new impossible archived-edition task became actionable"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$NEW_TASK_ID'::uuid and resolved_at is not null;")" == '1' ]] || fail "new archived-edition task lacks resolution evidence"
[[ "$(db_value "select count(*) from public.admin_notifications where source_key='$NEW_TASK_SOURCE_KEY' and requires_action;")" == '0' ]] || fail "generic notification sync projected a resolved archived task as actionable"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$NEW_TASK_ID' and category='organizer_tasks' and status in ('pending','processing');")" == '0' ]] || fail "generic notification sync enqueued a resolved archived task"

log "Governance/history work remains outside the fail-safe"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "task invariant incorrectly resolved incident governance work"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid and status='detected';")" == '1' ]] || fail "task invariant mutated incident domain state"

log "S14 archived task, failed-delivery evidence and notification non-resurrection rehearsal passed"
