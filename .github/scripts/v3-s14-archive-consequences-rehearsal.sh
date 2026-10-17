#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal creates and transitions disposable contest state. Hosted
# Solaris Supabase is never an acceptable target.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

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
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
service_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null; }

HTTP_STATUS=''
HTTP_BODY=''
request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}
expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}
expect_failure() {
  local label="$1"
  (( HTTP_STATUS < 200 || HTTP_STATUS >= 300 )) || fail "$label unexpectedly succeeded: $HTTP_BODY"
  log "PASS: $label failed closed with HTTP $HTTP_STATUS"
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
rpc() { request POST "$API_URL/rest/v1/rpc/$2" "$1" "$ANON_KEY" "$3"; }

EDITION_ID='18000000-0000-4000-8000-000000000001'
SHOW_ID='18000000-0000-4000-8000-000000000002'
COUNTRY_ID='18000000-0000-4000-8000-000000000003'
TASK_ID='18000000-0000-4000-8000-000000000004'
SENTINEL_RECEIPT='18000000-0000-4000-8000-000000000005'
ARCHIVE_OPERATION='18000000-0000-4000-8000-000000000006'
POST_EDITION_OPERATION='18000000-0000-4000-8000-000000000007'
ARCHIVE_IDEMPOTENCY_KEY='s14-archive-command-1800'
POST_EDITION_IDEMPOTENCY_KEY='s14-post-edition-command-1800'
ORGANIZER_EMAIL='s14-archive-organizer@solaris.invalid'
PASSWORD='S14-Archive-Local-Aa9!'

log "Seed focused post-results state and immutable historical sentinels"
db_exec "
insert into public.countries(id,name,short_code,region)
values ('$COUNTRY_ID','S14 Archive Country','S14A','S14 archive')
on conflict (id) do update set name=excluded.name;
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Archive Consequences','s14-archive-consequences',1800,2026,'completed',true)
on conflict (id) do update set name=excluded.name,status='completed',published=true;
insert into public.shows(id,edition_id,name,kind,sort_order,published)
values ('$SHOW_ID','$EDITION_ID','S14 Archive Final','final',1,true)
on conflict (id) do update set published=true;
insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_ID','results',private.studio2_default_subsystems('results'),7,null)
on conflict (edition_id) do update set state='results',subsystems=private.studio2_default_subsystems('results'),version=7,updated_by=null;
insert into private.v3_result_versions(show_id,edition_id,version,result_rows,result_row_count)
values ('$SHOW_ID','$EDITION_ID',1,jsonb_build_array(jsonb_build_object('countryId','$COUNTRY_ID','juryPoints',12,'televotePoints',10,'totalPoints',22,'finalRank',1)),1)
on conflict (show_id,version) do nothing;
insert into public.studio2_show_publication_controls(show_id,edition_id,state,version,frozen_config,source_result_version)
values ('$SHOW_ID','$EDITION_ID','public',3,'{}'::jsonb,1)
on conflict (show_id) do update set state='public',version=3,frozen_config='{}'::jsonb,source_result_version=1;
"

USER_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True,"user_metadata":{"display_name":"S14 Archive Organizer"}}))' "$ORGANIZER_EMAIL" "$PASSWORD")"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$USER_BODY"
if (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
  ORGANIZER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
else
  ORGANIZER_ID="$(db_value "select id from auth.users where lower(email)=lower('$ORGANIZER_EMAIL') limit 1;")"
fi
[[ -n "$ORGANIZER_ID" ]] || fail "local organizer identity missing"

db_exec "
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$ORGANIZER_ID'::uuid,'edition.manage','$EDITION_ID'::uuid),
 ('$ORGANIZER_ID'::uuid,'edition.archive','$EDITION_ID'::uuid)
on conflict do nothing;
insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$TASK_ID','$EDITION_ID','$ORGANIZER_ID','result_operation','$SHOW_ID',
 's14-archive:results-blocked','results.blocked','edition.manage','high','open',
 'Results need intervention','Focused S14 archive fixture','/admin/results','{}'::jsonb
) on conflict (id) do update set state='open',resolved_at=null,updated_at=now();
select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);
insert into public.notification_deliveries(
 user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
 '$ORGANIZER_ID','organizer_tasks','organizer.task.action_required','$TASK_ID',
 's14-archive-delivery','/admin/results','Results need intervention','Focused S14 archive fixture',now(),'pending'
) on conflict (user_id,dedupe_key) do update set status='pending',error=null;
insert into public.studio2_operation_receipts(
 operation_id,actor_id,idempotency_key,command,risk_class,scope,status,result
) values (
 '$SENTINEL_RECEIPT','$ORGANIZER_ID','s14-archive-sentinel','results.publish','R2',
 jsonb_build_object('editionId','$EDITION_ID','showId','$SHOW_ID'),'succeeded',jsonb_build_object('ok',true)
) on conflict (operation_id) do nothing;
"

[[ "$(db_value "select count(*) from public.admin_notifications where source_key='s14-archive:results-blocked';")" -ge 1 ]] || fail "task notification fixture was not projected"

SNAPSHOT_HASH="$(db_value "select md5(result_rows::text) from private.v3_result_versions where show_id='$SHOW_ID'::uuid and version=1;")"
PUBLICATION_HASH="$(db_value "select md5((to_jsonb(control)-'updated_at')::text) from public.studio2_show_publication_controls control where show_id='$SHOW_ID'::uuid;")"
RECEIPT_COUNT="$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$SENTINEL_RECEIPT'::uuid;")"

LOGIN_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$ORGANIZER_EMAIL" "$PASSWORD")"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$LOGIN_BODY"
expect_success "sign in archive Organizer"
ORGANIZER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
[[ -n "$ORGANIZER_TOKEN" ]] || fail "archive Organizer access token missing"

log "Move results → post-edition through the governed V3 lifecycle command"
rpc "$ORGANIZER_TOKEN" studio2_transition_edition_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"post_edition\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":7,\"p_operation_id\":\"$POST_EDITION_OPERATION\",\"p_idempotency_key\":\"$POST_EDITION_IDEMPOTENCY_KEY\"}"
expect_success "results to post-edition"
[[ "$(printf '%s' "$HTTP_BODY" | json_value state)" == 'post_edition' ]] || fail "post-edition command returned the wrong state"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'post_edition' ]] || fail "runtime did not reach post_edition"
ARCHIVE_EXPECTED_VERSION="$(db_value "select version::text from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")"
[[ "$ARCHIVE_EXPECTED_VERSION" == '8' ]] || fail "post-edition transition did not advance runtime exactly once"

log "Legacy browser Archive paths are blocked"
rpc "$ORGANIZER_TOKEN" studio2_transition_edition_v2 "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null}"
expect_failure "legacy v2 archive bypass"
rpc "$ORGANIZER_TOKEN" studio2_archive_edition_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_expected_version\":$ARCHIVE_EXPECTED_VERSION,\"p_operation_id\":\"$ARCHIVE_OPERATION\",\"p_idempotency_key\":\"$ARCHIVE_IDEMPOTENCY_KEY\",\"p_reason\":null}"
expect_failure "archive compatibility RPC bypass"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'post_edition' ]] || fail "legacy archive bypass changed canonical runtime"

log "Archive through the governed V3 lifecycle command"
rpc "$ORGANIZER_TOKEN" studio2_transition_edition_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$ARCHIVE_EXPECTED_VERSION,\"p_operation_id\":\"$ARCHIVE_OPERATION\",\"p_idempotency_key\":\"$ARCHIVE_IDEMPOTENCY_KEY\"}"
expect_success "post-edition to archive"
[[ "$(printf '%s' "$HTTP_BODY" | json_value state)" == 'archived' ]] || fail "archive RPC did not return archived runtime"
[[ "$(printf '%s' "$HTTP_BODY" | json_value operationId)" == "$ARCHIVE_OPERATION" ]] || fail "archive RPC returned the wrong operation identity"
[[ "$(printf '%s' "$HTTP_BODY" | json_value runtimeVersion)" == "$((ARCHIVE_EXPECTED_VERSION + 1))" ]] || fail "archive RPC returned the wrong runtime version"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'archived' ]] || fail "runtime archive truth missing"
[[ "$(db_value "select status from public.editions where id='$EDITION_ID'::uuid;")" == 'completed' ]] || fail "legacy edition status was incorrectly promoted into a second archive authority"

[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$ARCHIVE_OPERATION'::uuid and command='edition.transition' and status='succeeded';")" == '1' ]] || fail "archive operation receipt missing"
ARCHIVE_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived' limit 1;")"
[[ -n "$ARCHIVE_EVENT" ]] || fail "canonical edition.archived event missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == '1' ]] || fail "archive consequence outbox missing"
[[ "$(db_value "select payload->>'lifecycleAuthority' from private.v3_domain_events where id='$ARCHIVE_EVENT'::uuid;")" == 'studio2_edition_runtime' ]] || fail "archive event did not identify canonical lifecycle authority"

log "Exact retry replays the original result without duplicate archive facts"
EVENT_COUNT_BEFORE="$(db_value "select count(*) from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived';")"
LEGACY_ARCHIVE_COUNT_BEFORE="$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")"
rpc "$ORGANIZER_TOKEN" studio2_transition_edition_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":null,\"p_approval_request_id\":null,\"p_expected_version\":$ARCHIVE_EXPECTED_VERSION,\"p_operation_id\":\"$ARCHIVE_OPERATION\",\"p_idempotency_key\":\"$ARCHIVE_IDEMPOTENCY_KEY\"}"
expect_success "archive exact retry"
[[ "$(printf '%s' "$HTTP_BODY" | json_value operationId)" == "$ARCHIVE_OPERATION" ]] || fail "archive replay lost operation identity"
[[ "$(printf '%s' "$HTTP_BODY" | json_value replayed)" == 'true' ]] || fail "archive replay was not identified as a replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived';")" == "$EVENT_COUNT_BEFORE" ]] || fail "archive retry duplicated V3 event"
[[ "$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")" == "$LEGACY_ARCHIVE_COUNT_BEFORE" ]] || fail "archive retry duplicated legacy fact"

log "Same operation identity with changed semantics is rejected"
rpc "$ORGANIZER_TOKEN" studio2_transition_edition_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_to\":\"archived\",\"p_reason\":\"changed semantic request\",\"p_approval_request_id\":null,\"p_expected_version\":$ARCHIVE_EXPECTED_VERSION,\"p_operation_id\":\"$ARCHIVE_OPERATION\",\"p_idempotency_key\":\"$ARCHIVE_IDEMPOTENCY_KEY\"}"
expect_failure "archive idempotency conflict"

log "Archive outcome can be reconciled by exact operation identity"
rpc "$ORGANIZER_TOKEN" studio2_reconcile_operation "{\"p_operation_id\":\"$ARCHIVE_OPERATION\"}"
expect_success "archive operation reconciliation"
[[ "$(printf '%s' "$HTTP_BODY" | json_value status)" == 'succeeded' ]] || fail "archive reconciliation did not report succeeded"
[[ "$(printf '%s' "$HTTP_BODY" | json_value result.state)" == 'archived' ]] || fail "archive reconciliation did not return archived result"
[[ "$(printf '%s' "$HTTP_BODY" | json_value result.runtimeVersion)" == "$((ARCHIVE_EXPECTED_VERSION + 1))" ]] || fail "archive reconciliation returned the wrong runtime version"

log "Consume archive consequences under a service lease"
CLAIMED="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('edition.tasks','s14-archive-worker',100,60);")"
printf '%s\n' "$CLAIMED" | grep -Fxq "$ARCHIVE_EVENT" || fail "edition.tasks could not claim archive event"
service_exec "select public.studio2_process_edition_domain_event('$ARCHIVE_EVENT'::uuid,'edition.tasks','s14-archive-worker');"
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == 'completed' ]] || fail "archive consequence delivery did not complete"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == '1' ]] || fail "archive consequence receipt missing"

log "Impossible workflow work reconciles away without erasing historical evidence"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "archived Results task remained actionable"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == '1' ]] || fail "historical task row was deleted"
[[ "$(db_value "select count(*) from public.admin_notifications where source_key='s14-archive:results-blocked' and resolved_at is not null and requires_action=false;")" -ge 1 ]] || fail "resolved task notification still claims action or was deleted"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$ORGANIZER_ID'::uuid and dedupe_key='s14-archive-delivery';")" == 'suppressed' ]] || fail "pending archived-work push delivery was not suppressed"

log "Result/publication/receipt provenance is unchanged by archive"
[[ "$(db_value "select md5(result_rows::text) from private.v3_result_versions where show_id='$SHOW_ID'::uuid and version=1;")" == "$SNAPSHOT_HASH" ]] || fail "immutable result snapshot changed during archive"
[[ "$(db_value "select md5((to_jsonb(control)-'updated_at')::text) from public.studio2_show_publication_controls control where show_id='$SHOW_ID'::uuid;")" == "$PUBLICATION_HASH" ]] || fail "publication provenance changed during archive"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$SENTINEL_RECEIPT'::uuid;")" == "$RECEIPT_COUNT" ]] || fail "historical operation receipt was lost during archive"

log "Rebuilding tasks after archive cannot resurrect the impossible workflow task"
service_exec "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "generic reconciliation resurrected archived workflow work"

log "S14 archive consequence rehearsal passed"
