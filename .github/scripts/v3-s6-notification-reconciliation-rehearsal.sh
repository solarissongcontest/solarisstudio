#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s6-notification-reconciliation] %s\n' "$*"; }
fail() { printf '\n[v3-s6-notification-reconciliation] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
expect_failure() {
  local label="$1" sql="$2" output
  output="$(mktemp)"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  rm -f "$output"
  log "PASS: $label rejected"
}
assert_json() {
  local payload="$1" expression="$2"
  python3 - "$payload" "$expression" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
expr=sys.argv[2]
if not eval(expr, {"__builtins__": {}}, {"p": p}):
    raise SystemExit(f"assertion failed: {expr}; payload={p}")
PY
}

USER_ID='00000000-0000-4000-8000-00000000b601'
TASK_ID='00000000-0000-4000-8000-00000000b602'
SOURCE_KEY='s6-notification-reconcile:organizer-task'
PROVIDER='organizer-task-activation'

log "Seed one capable recipient and one canonical high-priority Organizer Task"
db_exec "
delete from public.notification_deliveries where user_id='$USER_ID'::uuid;
delete from public.studio2_organizer_tasks where id='$TASK_ID'::uuid or source_key='$SOURCE_KEY';
delete from public.studio2_capability_grants where user_id='$USER_ID'::uuid;
delete from auth.users where id='$USER_ID'::uuid;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s6-notification@local.invalid',now(),now());
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID'::uuid,'system.manage',null);
insert into public.studio2_organizer_tasks(
  id,assigned_to,source_kind,source_id,source_key,task_type,
  required_capability,priority,state,title,description,href,
  resolution_predicate,opened_at,resolved_at,last_evaluated_at,updated_at
) values (
  '$TASK_ID'::uuid,'$USER_ID'::uuid,'s6_rehearsal','$TASK_ID','$SOURCE_KEY','s6.notification.rehearsal',
  'system.manage','high','open','S6 notification rehearsal','Bounded notification reconciliation fixture.','/admin/tasks',
  '{}'::jsonb,now(),null,now(),now()
);
"

BEFORE="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$BEFORE" "p['state'] == 'drift'"
assert_json "$BEFORE" "p['missing'] == 1"
log "PASS: independent verifier detects the missing projection"

expect_failure "ordinary authenticated repair" "set \"request.jwt.claim.role\"='authenticated'; select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now());"
expect_failure "unsupported provider" "set \"request.jwt.claim.role\"='service_role'; select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'jury-open',now());"

FIRST="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$FIRST" "p['inserted'] == 1"
assert_json "$FIRST" "p['state'] == 'consistent'"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='organizer-task:$SOURCE_KEY:$USER_ID';")" == '1' ]] || fail "stable dedupe row was not created exactly once"

SECOND="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$SECOND" "p['changed'] == 0"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='organizer-task:$SOURCE_KEY:$USER_ID';")" == '1' ]] || fail "idempotent repair duplicated the delivery"
log "PASS: repeated repair is idempotent"

log "Resolve canonical Task and prove stale active delivery is suppressed"
db_exec "update public.studio2_organizer_tasks set state='resolved',resolved_at=now(),updated_at=now() where id='$TASK_ID'::uuid;"
STALE="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$STALE" "p['state'] == 'drift'"
assert_json "$STALE" "p['staleActive'] == 1"
SUPPRESS="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$SUPPRESS" "p['suppressed'] == 1"
assert_json "$SUPPRESS" "p['state'] == 'consistent'"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='organizer-task:$SOURCE_KEY:$USER_ID';")" == 'suppressed' ]] || fail "stale delivery was not suppressed"

log "Re-open canonical Task and prove never-sent suppressed identity can be reactivated without duplication"
db_exec "update public.studio2_organizer_tasks set state='open',resolved_at=null,updated_at=now() where id='$TASK_ID'::uuid;"
REOPENED="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$REOPENED" "p['state'] == 'drift'"
assert_json "$REOPENED" "p['suppressedExpected'] == 1"
REACTIVATE="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$REACTIVATE" "p['reactivated'] == 1"
assert_json "$REACTIVATE" "p['state'] == 'consistent'"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='organizer-task:$SOURCE_KEY:$USER_ID';")" == '1' ]] || fail "reactivation created a second delivery identity"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='organizer-task:$SOURCE_KEY:$USER_ID';")" == 'pending' ]] || fail "eligible suppressed delivery was not reactivated"

log "System V3 S6 bounded Organizer Task notification reconciliation passed"
