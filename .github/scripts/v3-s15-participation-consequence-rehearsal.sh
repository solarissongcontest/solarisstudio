#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s15-participation] %s\n' "$*"; }
fail() { printf '[v3-s15-participation] ERROR: %s\n' "$*" >&2; exit 1; }

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

EDITION_ID='19450000-0000-4000-8000-000000000001'
COUNTRY_ID='19450000-0000-4000-8000-000000000002'
PARTICIPANT_ID='19450000-0000-4000-8000-000000000003'
ENTRY_ID='19450000-0000-4000-8000-000000000004'
OPERATION_ID='19450000-0000-4000-8000-000000000005'
WORKER_ID='s15-participation-worker'
EMAIL="s15-participation-$(date +%s)-$$@solaris.invalid"

log "Create isolated local organizer identity"
USER_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"email_confirm":True,"user_metadata":{"display_name":"S15 Participation Organizer"}}))' "$EMAIL")"
HTTP_CODE="$(curl -sS -o /tmp/v3-s15-participation-user.json -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$USER_BODY")"
[[ "$HTTP_CODE" == '200' || "$HTTP_CODE" == '201' ]] || fail "local auth user creation failed: HTTP $HTTP_CODE"
USER_ID="$(cat /tmp/v3-s15-participation-user.json | json_value id)"
[[ -n "$USER_ID" ]] || fail "local auth user id missing"

log "Seed canonical participation drift without manufacturing a fake withdrawal blocker"
db_exec "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S15 Participation Consequences','s15-participation-consequences',1945,2026,'active',false)
on conflict (id) do update set status='active',published=false;

insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','S15 Driftland','S15DRIFT')
on conflict (id) do nothing;

insert into public.participants(
  id,edition_id,show_id,country_id,artist,song,semi_final,participation_status
) values (
  '$PARTICIPANT_ID','$EDITION_ID',null,'$COUNTRY_ID','S15 Artist','S15 Song','final','confirmed'
)
on conflict (id) do update set participation_status='confirmed',updated_at=now();

insert into public.entries(
  id,edition_id,country_id,artist,song_title,status,source
) values (
  '$ENTRY_ID','$EDITION_ID','$COUNTRY_ID','S15 Artist','S15 Song','withdrawn','solaris'
)
on conflict (edition_id,country_id) do update
set status='withdrawn',artist=excluded.artist,song_title=excluded.song_title,updated_at=now();

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','entry.approve','$EDITION_ID')
on conflict do nothing;
"

log "Drift reconciliation must open exactly one critical participation blocker"
as_service "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);" >/dev/null
TASK_KEY="participation-drift:$EDITION_ID:country:$COUNTRY_ID"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where source_key='$TASK_KEY' and task_type='participation.blocker' and state='open';")" == '1' ]] || fail "participation blocker was not opened"
[[ "$(db_value "select count(*) from private.studio2_participation_status_drifts('$EDITION_ID'::uuid);")" == '1' ]] || fail "canonical participation drift detector did not identify fixture"

log "Unauthorized actor cannot use the governed participation command"
UNAUTH_OUT="$(psql "$DB_URL" -Atq -c "set role authenticated; set request.jwt.claims = '{\"sub\":\"00000000-0000-4000-8000-000000000099\",\"role\":\"authenticated\"}'; select public.studio2_participation_status_change_preview('$EDITION_ID'::uuid,'$COUNTRY_ID'::uuid,null,'confirmed');" 2>&1 || true)"
[[ "$UNAUTH_OUT" == *'Missing Solaris capability: entry.approve'* ]] || fail "participation authorization guard was bypassed"

PREVIEW="$(as_user "$USER_ID" "select public.studio2_participation_status_change_preview('$EDITION_ID'::uuid,'$COUNTRY_ID'::uuid,null,'confirmed')::text;")"
EXPECTED_VERSION="$(printf '%s' "$PREVIEW" | json_value expectedVersion)"
[[ -n "$EXPECTED_VERSION" ]] || fail "participation preview did not expose expected version"

log "Authorized R2 operation emits exactly one canonical event and leaves the task to the consumer"
as_user "$USER_ID" "select public.studio2_apply_participation_status(
  '$EDITION_ID'::uuid,'$COUNTRY_ID'::uuid,null,'confirmed',
  '$OPERATION_ID'::uuid,'s15-participation-confirm',$EXPECTED_VERSION
);" >/dev/null

EVENT_ID="$(db_value "select id::text from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='participation.changed';")"
[[ -n "$EVENT_ID" ]] || fail "participation.changed was not emitted"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='participation.changed';")" == '1' ]] || fail "participation operation emitted duplicate events"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "participation task delivery was not persisted"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='$TASK_KEY';")" == 'open' ]] || fail "participation task changed before consequence consumption"

[[ "$(db_value "select count(distinct coalesce(participation_status,'confirmed')) from public.participants where edition_id='$EDITION_ID'::uuid and country_id='$COUNTRY_ID'::uuid;")" == '1' ]] || fail "participant readback did not converge"
[[ "$(db_value "select status from public.entries where edition_id='$EDITION_ID'::uuid and country_id='$COUNTRY_ID'::uuid;")" == 'confirmed' ]] || fail "entry participation readback did not converge"
[[ "$(db_value "select count(*) from private.studio2_participation_status_drifts('$EDITION_ID'::uuid);")" == '0' ]] || fail "authoritative operation did not repair canonical drift"

log "Leased consequence consumer resolves the stale blocker and records operation linkage"
as_service "select count(*) from public.studio2_claim_domain_event_deliveries('system.tasks','$WORKER_ID',200,60);" >/dev/null
RESULT="$(as_service "select public.studio2_process_shared_task_domain_event('$EVENT_ID'::uuid,'system.tasks','$WORKER_ID')::text;")"
[[ "$RESULT" == *'completed'* ]] || fail "participation consequence consumer did not complete"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='$TASK_KEY';")" == 'resolved' ]] || fail "participation blocker did not resolve"
[[ "$(db_value "select result_metadata->>'operationId' from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == "$OPERATION_ID" ]] || fail "consumer receipt lost operation linkage"

log "Command and consumer replay are idempotent"
as_user "$USER_ID" "select public.studio2_apply_participation_status(
  '$EDITION_ID'::uuid,'$COUNTRY_ID'::uuid,null,'confirmed',
  '$OPERATION_ID'::uuid,'s15-participation-confirm',$EXPECTED_VERSION
);" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='participation.changed';")" == '1' ]] || fail "participation command replay duplicated event"
REPLAYED="$(as_service "select public.studio2_process_shared_task_domain_event('$EVENT_ID'::uuid,'system.tasks','s15-participation-replay')->>'replayed';")"
[[ "$REPLAYED" == 'true' ]] || fail "participation consumer replay was not idempotent"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$EVENT_ID'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "participation replay duplicated consumer receipt"

log "PASS: participation drift -> governed operation -> DomainEvent/outbox -> reconciliation -> canonical readback"
