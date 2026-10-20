#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-task-invariant] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-task-invariant] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This verifier consumes the archived fixture produced by the guard rehearsal.
# It intentionally attempts server-side projection writes, so remain local-only.
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

export DATABASE_URL="$DB_URL"
export SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

EDITION_ID='18910000-0000-4000-8000-000000000001'
INCIDENT_ID='18910000-0000-4000-8000-000000000003'
BLOCKER_ID='18910000-0000-4000-8000-000000000004'
NEW_TASK_ID='18910000-0000-4000-8000-000000000005'
AUTHORIZED_ID="$(db_value "select id::text from auth.users where lower(email)='s14-archive-guards-authorized@solaris.invalid' limit 1;")"
[[ -n "$AUTHORIZED_ID" ]] || fail "guard rehearsal operator fixture is missing"

[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'archived' ]] || fail "guard rehearsal did not leave the fixture archived"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='v3-s14-archive-guard:edition-blocker' and not requires_action and resolved_at is not null;")" == '1' ]] || fail "guard rehearsal did not leave the blocker Inbox projection resolved"

log "Poison the resolved notification projection, then attempt to resurrect the canonical Edition blocker"
db_exec "
update public.admin_notifications
set resolved_at=null, requires_action=true
where recipient_id='$AUTHORIZED_ID'::uuid
  and source_key='v3-s14-archive-guard:edition-blocker';

update public.notification_deliveries
set status='pending', processing_started_at=null, error=null
where subject_id='$BLOCKER_ID'
  and category='organizer_tasks';
"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='v3-s14-archive-guard:edition-blocker' and requires_action and resolved_at is null;")" == '1' ]] || fail "could not poison blocker Inbox projection for invariant rehearsal"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status='pending';")" -ge '1' ]] || fail "could not poison blocker delivery projection for invariant rehearsal"

RESOLVED_AT_BEFORE="$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")"
[[ -n "$RESOLVED_AT_BEFORE" ]] || fail "archived blocker lacks a resolution timestamp before resurrection attempt"

db_exec "
update public.studio2_organizer_tasks
set state='open', resolved_at=null, updated_at=now()
where id='$BLOCKER_ID'::uuid;
"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == 'resolved' ]] || fail "archived edition.blocker was resurrected"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid and resolved_at is not null;")" == '1' ]] || fail "resurrection guard did not retain blocker resolution evidence"
[[ "$(db_value "select resolved_at::text from public.studio2_organizer_tasks where id='$BLOCKER_ID'::uuid;")" == "$RESOLVED_AT_BEFORE" ]] || fail "resurrection guard rewrote historical blocker resolution timestamp"
[[ "$(db_value "select count(*) from public.admin_notifications where recipient_id='$AUTHORIZED_ID'::uuid and source_key='v3-s14-archive-guard:edition-blocker' and not requires_action and resolved_at is not null;")" == '1' ]] || fail "task resolution did not immediately repair poisoned Inbox action state"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$BLOCKER_ID' and category='organizer_tasks' and status in ('pending','processing','failed');")" == '0' ]] || fail "task resolution did not immediately suppress poisoned delivery state"

log "Attempt to create new impossible current-contest work after Archive"
db_exec "
insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$NEW_TASK_ID','$EDITION_ID','$AUTHORIZED_ID'::uuid,'result_operation','post-archive-fixture',
 'v3-s14-archive-guard:post-archive-results','results.blocked','edition.manage',
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
[[ "$(db_value "select count(*) from public.admin_notifications where source_key='v3-s14-archive-guard:post-archive-results' and requires_action;")" == '0' ]] || fail "generic notification sync projected a resolved archived task as actionable"
[[ "$(db_value "select count(*) from public.notification_deliveries where subject_id='$NEW_TASK_ID' and category='organizer_tasks' and status in ('pending','processing','failed');")" == '0' ]] || fail "generic notification sync enqueued a resolved archived task"

log "Governance/history work remains outside the fail-safe"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_kind='incident' and source_id='$INCIDENT_ID';")" == 'open' ]] || fail "task invariant incorrectly resolved incident governance work"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid and status='open';")" == '1' ]] || fail "task invariant mutated incident domain state"

log "S14 archived task and notification non-resurrection rehearsal passed"
