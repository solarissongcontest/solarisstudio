#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s15-selection] %s\n' "$*"; }
fail() { printf '[v3-s15-selection] ERROR: %s\n' "$*" >&2; exit 1; }

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

EDITION_ID='19300000-0000-4000-8000-000000000001'
ROUND_ID='19300000-0000-4000-8000-000000000002'
INTERNAL_SUBMISSION='19300000-0000-4000-8000-000000000004'
INTERNAL_ENTRY='19300000-0000-4000-8000-000000000005'
NF_SUBMISSION='19300000-0000-4000-8000-000000000006'
NF_ID='19300000-0000-4000-8000-000000000007'
NF_ENTRY='19300000-0000-4000-8000-000000000008'
INTERNAL_OPERATION='19300000-0000-4000-8000-000000000009'
NF_REVIEW_OPERATION='19300000-0000-4000-8000-000000000010'
WINNER_OPERATION='19300000-0000-4000-8000-000000000011'
WORKER_ID='s15-selection-worker'
EMAIL="s15-selection-$(date +%s)-$$@solaris.invalid"

log "Create isolated local organizer identity"
USER_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"email_confirm":True,"user_metadata":{"display_name":"S15 Selection Organizer"}}))' "$EMAIL")"
HTTP_CODE="$(curl -sS -o /tmp/v3-s15-selection-user.json -w '%{http_code}' -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$USER_BODY")"
[[ "$HTTP_CODE" == '200' || "$HTTP_CODE" == '201' ]] || fail "local auth user creation failed: HTTP $HTTP_CODE"
USER_ID="$(cat /tmp/v3-s15-selection-user.json | json_value id)"
[[ -n "$USER_ID" ]] || fail "local auth user id missing"

log "Seed internal and National Final selections"
db_exec "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S15 Selection Consequences','s15-selection-consequences',1930,2026,'active',false)
on conflict (id) do update set status='active',published=false;

insert into public.submission_rounds(id,edition_id,name,status,editing_enabled)
values ('$ROUND_ID','$EDITION_ID','S15 Selection Round','open',true)
on conflict (id) do nothing;

insert into public.submissions(
  id,edition_id,round_id,instagram_username,country,participating,selection_method,
  entry_unknown,nf_entries_unknown,editing_allowed,locked,reviewed
) values
  ('$INTERNAL_SUBMISSION','$EDITION_ID','$ROUND_ID','s15_internal','S15 Internal',true,'internal',false,false,true,false,false),
  ('$NF_SUBMISSION','$EDITION_ID','$ROUND_ID','s15_nf','S15 NF',true,'national_final',false,false,true,false,false)
on conflict (id) do nothing;

insert into public.internal_entries(id,submission_id,artist,song_title,review_status)
values ('$INTERNAL_ENTRY','$INTERNAL_SUBMISSION','Internal Artist','Internal Song','pending')
on conflict (id) do nothing;

insert into public.national_finals(id,submission_id,nf_name)
values ('$NF_ID','$NF_SUBMISSION','S15 National Final')
on conflict (id) do nothing;
insert into public.national_final_entries(id,national_final_id,artist,song_title,position,review_status,removed)
values ('$NF_ENTRY','$NF_ID','NF Artist','NF Song',1,'pending',false)
on conflict (id) do nothing;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','confirmation.manage','$EDITION_ID')
on conflict do nothing;
"

log "Canonical aggregate reconciliation opens one review task per pending entry"
as_service "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);" >/dev/null
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where edition_id='$EDITION_ID'::uuid and task_type='selection.review_required' and state='open';")" == '2' ]] || fail "selection review tasks were not projected"

INTERNAL_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$INTERNAL_SUBMISSION'::uuid;")"
INTERNAL_ENTRY_VERSION="$(db_value "select current_version_id::text from public.internal_entries where id='$INTERNAL_ENTRY'::uuid;")"
[[ -n "$INTERNAL_VERSION" && -n "$INTERNAL_ENTRY_VERSION" ]] || fail "internal selection version evidence missing"

log "Authorized exact-version review emits selection.reviewed but does not mutate task truth before consumption"
as_user "$USER_ID" "select public.studio2_apply_confirmation_entry_review(
  'internal','$INTERNAL_ENTRY'::uuid,'accepted',null,
  '$INTERNAL_OPERATION'::uuid,'s15-internal-review',$INTERNAL_VERSION,'$INTERNAL_ENTRY_VERSION'::uuid
);" >/dev/null

INTERNAL_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$INTERNAL_OPERATION'::uuid and event_type='selection.reviewed';")"
[[ -n "$INTERNAL_EVENT" ]] || fail "selection.reviewed was not emitted"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$INTERNAL_EVENT'::uuid and consumer_key='system.tasks';")" == '1' ]] || fail "selection.reviewed outbox delivery missing"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='selection_review:internal:$INTERNAL_ENTRY';")" == 'open' ]] || fail "review task changed before consumer execution"

as_service "select count(*) from public.studio2_claim_domain_event_deliveries('system.tasks','$WORKER_ID',200,60);" >/dev/null
INTERNAL_RESULT="$(as_service "select public.studio2_process_shared_task_domain_event('$INTERNAL_EVENT'::uuid,'system.tasks','$WORKER_ID')::text;")"
[[ "$INTERNAL_RESULT" == *'completed'* ]] || fail "selection.reviewed consumer did not complete"
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='selection_review:internal:$INTERNAL_ENTRY';")" == 'resolved' ]] || fail "selection review task did not converge to resolved"
[[ "$(db_value "select review_status from public.internal_entries where id='$INTERNAL_ENTRY'::uuid;")" == 'accepted' ]] || fail "canonical accepted review readback is wrong"

log "Review the National Final candidate, then select it as canonical winner"
NF_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$NF_SUBMISSION'::uuid;")"
NF_ENTRY_VERSION="$(db_value "select current_version_id::text from public.national_final_entries where id='$NF_ENTRY'::uuid;")"
as_user "$USER_ID" "select public.studio2_apply_confirmation_entry_review(
  'national_final','$NF_ENTRY'::uuid,'accepted',null,
  '$NF_REVIEW_OPERATION'::uuid,'s15-nf-review',$NF_VERSION,'$NF_ENTRY_VERSION'::uuid
);" >/dev/null
NF_REVIEW_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$NF_REVIEW_OPERATION'::uuid and event_type='selection.reviewed';")"
[[ -n "$NF_REVIEW_EVENT" ]] || fail "National Final selection.reviewed event missing"
as_service "select count(*) from public.studio2_claim_domain_event_deliveries('system.tasks','$WORKER_ID',200,60);" >/dev/null
as_service "select public.studio2_process_shared_task_domain_event('$NF_REVIEW_EVENT'::uuid,'system.tasks','$WORKER_ID');" >/dev/null
[[ "$(db_value "select state from public.studio2_organizer_tasks where source_key='selection_review:national_final:$NF_ENTRY';")" == 'resolved' ]] || fail "National Final review task did not resolve"

WINNER_VERSION="$(db_value "select version::text from public.studio2_confirmation_review_versions where submission_id='$NF_SUBMISSION'::uuid;")"
as_user "$USER_ID" "select public.studio2_apply_confirmation_winner_change(
  '$NF_ID'::uuid,'select','$NF_ENTRY'::uuid,'S15 winner rehearsal',
  '$WINNER_OPERATION'::uuid,'s15-winner-select',$WINNER_VERSION
);" >/dev/null
WINNER_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$WINNER_OPERATION'::uuid and event_type='selection.winner_changed';")"
[[ -n "$WINNER_EVENT" ]] || fail "selection.winner_changed was not emitted"
[[ "$(db_value "select winning_entry_id::text from public.national_finals where id='$NF_ID'::uuid;")" == "$NF_ENTRY" ]] || fail "public/canonical winner readback does not match exact accepted candidate"

as_service "select count(*) from public.studio2_claim_domain_event_deliveries('system.tasks','$WORKER_ID',200,60);" >/dev/null
as_service "select public.studio2_process_shared_task_domain_event('$WINNER_EVENT'::uuid,'system.tasks','$WORKER_ID');" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id in ('$INTERNAL_EVENT'::uuid,'$NF_REVIEW_EVENT'::uuid,'$WINNER_EVENT'::uuid) and consumer_key='system.tasks';")" == '3' ]] || fail "selection consumer receipts are incomplete"

log "Exact operation replay and consumer replay remain idempotent"
as_user "$USER_ID" "select public.studio2_apply_confirmation_winner_change(
  '$NF_ID'::uuid,'select','$NF_ENTRY'::uuid,'S15 winner rehearsal',
  '$WINNER_OPERATION'::uuid,'s15-winner-select',$WINNER_VERSION
);" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$WINNER_OPERATION'::uuid and event_type='selection.winner_changed';")" == '1' ]] || fail "winner operation replay duplicated DomainEvent"
REPLAYED="$(as_service "select public.studio2_process_shared_task_domain_event('$WINNER_EVENT'::uuid,'system.tasks','s15-selection-replay')->>'replayed';")"
[[ "$REPLAYED" == 'true' ]] || fail "selection consumer replay was not idempotent"

log "PASS: selection review/winner operations -> DomainEvent/outbox -> task reconciliation -> canonical readback"
