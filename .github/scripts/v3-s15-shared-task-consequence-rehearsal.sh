#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s15-task-consequence] %s\n' "$*"; }
fail() { printf '[v3-s15-task-consequence] ERROR: %s\n' "$*" >&2; exit 1; }

# Stateful fixture work is intentionally local-only. Never fall through to a
# hosted project when local environment variables are missing.
eval "$(supabase status -o env 2>/dev/null || true)"
API_URL="${API_URL:-${SUPABASE_URL:-}}"
DB_URL="${DB_URL:-${SUPABASE_DB_URL:-}}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: API_URL must be loopback" ;;
esac
case "$DB_URL" in
  postgres://*@127.0.0.1:*/*|postgresql://*@127.0.0.1:*/*|postgres://*@localhost:*/*|postgresql://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: DB_URL must be loopback" ;;
esac
[[ -n "$SERVICE_ROLE_KEY" ]] || fail "local SERVICE_ROLE_KEY is required"

export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local

if [[ -f scripts/check-v3-production-isolation.ts ]]; then
  bun run scripts/check-v3-production-isolation.ts
fi

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql" \
    | tail -n1 | tr -d '\r'
}
as_service() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set \"request.jwt.claim.role\" = 'service_role'; $sql" \
    | tail -n1 | tr -d '\r'
}

EDITION_ID='19150000-0000-4000-8000-000000000001'
ORGANIZER_ID='19150000-0000-4000-8000-000000000002'
TASK_ID='19150000-0000-4000-8000-000000000003'
OPERATION_ID='19150000-0000-4000-8000-000000000004'
IDEMPOTENCY_KEY='s15-edition-transition-task-consumer'
WORKER_ID='s15-task-worker'

log "Seed one local edition, organizer capability and deliberately stale task projection"
db_exec "
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('$ORGANIZER_ID','authenticated','authenticated','s15-task-consequence@solaris.invalid','',now(),now(),now())
on conflict (id) do nothing;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S15 Task Consequence','s15-task-consequence',1915,2026,'active',false)
on conflict (id) do update set status='active',published=false;

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_ID','confirmations',private.studio2_default_subsystems('confirmations'),1,null)
on conflict (edition_id) do update
set state='confirmations',subsystems=private.studio2_default_subsystems('confirmations'),version=1,updated_by=null;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$ORGANIZER_ID','edition.manage','$EDITION_ID'),
  ('$ORGANIZER_ID','edition.transition','$EDITION_ID')
on conflict do nothing;

insert into public.studio2_organizer_tasks(
  id,edition_id,source_kind,source_id,source_key,task_type,required_capability,
  priority,state,title,description,href,resolution_predicate
) values (
  '$TASK_ID','$EDITION_ID','subsystem_pause','$EDITION_ID:jury',
  's15:stale-subsystem-task','edition.subsystem.paused','edition.read',
  'high','open','Stale task fixture','Must be repaired from canonical runtime',
  '/admin/control-room','{}'::jsonb
)
on conflict (id) do update set state='open',resolved_at=null,updated_at=now();
"

[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'open' ]] || fail "stale task fixture was not open"

log "Execute the governed edition transition exactly once"
as_user "$ORGANIZER_ID" \
  "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'submissions',null,null,1,'$OPERATION_ID'::uuid,'$IDEMPOTENCY_KEY');" >/dev/null

EVENT_ID="$(db_value "select id::text from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='edition.transitioned';")"
[[ -n "$EVENT_ID" ]] || fail "edition.transitioned was not emitted"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='edition.transitioned';")" == '1' ]] || fail "edition transition emitted duplicate canonical events"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "system.tasks outbox delivery was not persisted transactionally"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'open' ]] || fail "task changed before the consumer executed"

log "Claim and process the leased task consequence"
CLAIMED="$(as_service "select count(*)::text from public.studio2_claim_domain_event_deliveries('system.tasks','$WORKER_ID',10,60);")"
[[ "$CLAIMED" -ge 1 ]] || fail "system.tasks delivery was not claimable"

RESULT="$(as_service "select public.studio2_process_shared_task_domain_event('$EVENT_ID'::uuid,'system.tasks','$WORKER_ID')::text;")"
[[ "$RESULT" == *'"status": "completed"'* || "$RESULT" == *'"status":"completed"'* ]] || fail "shared task consumer did not complete"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "reconciliation did not repair stale task projection"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "consumer receipt missing"
[[ "$(db_value "select result_metadata->>'operationId' from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == "$OPERATION_ID" ]] || fail "consumer observability lost operation linkage"

log "Exact command replay and consumer replay must not duplicate mutation or delivery"
as_user "$ORGANIZER_ID" \
  "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'submissions',null,null,1,'$OPERATION_ID'::uuid,'$IDEMPOTENCY_KEY');" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='edition.transitioned';")" == '1' ]] || fail "command replay duplicated edition.transitioned"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "command replay duplicated task delivery"

REPLAYED="$(as_service "select public.studio2_process_shared_task_domain_event('$EVENT_ID'::uuid,'system.tasks','replay-worker')->>'replayed';")"
[[ "$REPLAYED" == 'true' ]] || fail "consumer replay was not idempotent"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "consumer replay duplicated receipt"

log "PASS: edition.transitioned producer -> outbox -> idempotent consumer -> reconciliation converged"
