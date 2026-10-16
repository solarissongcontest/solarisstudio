#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-televote-deadline] %s\n' "$*"; }
fail() { printf '\n[v3-s14-televote-deadline] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing non-local API rehearsal: $API_URL" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

export SUPABASE_URL="$API_URL"
export SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL"
export VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL"
export VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

HTTP_STATUS=''
HTTP_BODY=''
request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}" profile="${6-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  if [[ -n "$profile" ]]; then
    args+=(-H "Content-Profile: $profile" -H "Accept-Profile: $profile")
  fi
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
  (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded: $HTTP_BODY"
  log "PASS: $label rejected with HTTP $HTTP_STATUS"
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
rpc() { request POST "$API_URL/rest/v1/rpc/$2" "$1" "$ANON_KEY" "$3" "${4-}"; }

EDITION_ID='17000000-0000-4000-8000-000000000001'
TV_EDITION_ID='17000000-0000-4000-8000-000000000002'
ROUND_ID='17000000-0000-4000-8000-000000000003'
ORGANIZER_EMAIL='s14-deadline-organizer@solaris.invalid'
PASSWORD='S14-Deadline-Local-Aa9!'

log "Seed one linked V3 Televote round and exact local organizer authority"
db_exec "
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 deadline authority','s14-deadline-authority',1700,2026,'active',false)
on conflict (id) do update set status='active',published=false;
insert into televoting.editions(id,name,is_active,is_archived)
values ('$TV_EDITION_ID','S14 deadline authority',true,false)
on conflict (id) do update set is_active=true,is_archived=false;
insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at)
values ('televoting','edition','$EDITION_ID'::uuid,'$TV_EDITION_ID','$EDITION_ID'::uuid,'linked','{\"source\":\"s14-deadline-authority\"}'::jsonb,now())
on conflict (service,entity_type,remote_id) do update set solaris_id=excluded.solaris_id,edition_id=excluded.edition_id,sync_status='linked',metadata=excluded.metadata,last_synced_at=now(),updated_at=now();
insert into televoting.countries(code,name,flag) values
 ('D01','Deadline 01','1'),('D02','Deadline 02','2'),('D03','Deadline 03','3'),
 ('D04','Deadline 04','4'),('D05','Deadline 05','5'),('D06','Deadline voter','6'),('D07','Deadline voter 2','7')
on conflict (code) do update set name=excluded.name;
insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode)
values ('$ROUND_ID','$TV_EDITION_ID','S14 genuine extension','draft',58,'countries','country_match')
on conflict (id) do update set
 status='draft',opened_at=null,closed_at=null,results_status='draft',calculation_version=0,
 voting_deadline_at=null,voting_deadline_revision=0,updated_at=now();
delete from televoting.round_entries where round_id='$ROUND_ID'::uuid;
insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order) values
 ('$ROUND_ID','country','D01','D01','D01','D01',1),
 ('$ROUND_ID','country','D02','D02','D02','D02',2),
 ('$ROUND_ID','country','D03','D03','D03','D03',3),
 ('$ROUND_ID','country','D04','D04','D04','D04',4),
 ('$ROUND_ID','country','D05','D05','D05','D05',5);
"

USER_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True,"user_metadata":{"display_name":"S14 Deadline Organizer"}}))' "$ORGANIZER_EMAIL" "$PASSWORD")"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$USER_BODY"
if (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )); then
  ORGANIZER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
else
  ORGANIZER_ID="$(db_scalar "select id from auth.users where lower(email)=lower('$ORGANIZER_EMAIL') limit 1;")"
fi
[[ -n "$ORGANIZER_ID" ]] || fail "local organizer identity missing"
db_exec "insert into public.studio2_role_assignments(user_id,role_key,edition_id,expires_at,assigned_by)
values ('$ORGANIZER_ID'::uuid,'organizer',null,null,null)
on conflict on constraint studio2_role_assignments_scope_unique do nothing;"
LOGIN_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$ORGANIZER_EMAIL" "$PASSWORD")"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$LOGIN_BODY"
expect_success "sign in local Organizer"
ORGANIZER_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
[[ -n "$ORGANIZER_TOKEN" ]] || fail "organizer access token missing"

log "Configure a canonical deadline through preview/apply"
DEADLINE="$(python3 - <<'PY'
from datetime import datetime,timezone,timedelta
print((datetime.now(timezone.utc)+timedelta(seconds=3)).isoformat().replace('+00:00','Z'))
PY
)"
rpc "$ORGANIZER_TOKEN" studio2_round_deadline_set_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_deadline_at\":\"$DEADLINE\"}" televoting
expect_success "deadline set preview"
[[ "$(printf '%s' "$HTTP_BODY" | json_value blockers)" == "[]" ]] || fail "deadline set preview blockers: $HTTP_BODY"
SET_GLOBAL="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
SET_ROUND="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
rpc "$ORGANIZER_TOKEN" studio2_apply_round_deadline_set "{\"p_round_id\":\"$ROUND_ID\",\"p_deadline_at\":\"$DEADLINE\",\"p_operation_id\":\"17000000-0000-4000-8000-000000000010\",\"p_idempotency_key\":\"s14-deadline-set\",\"p_expected_global_version\":$SET_GLOBAL,\"p_expected_round_version\":$SET_ROUND}" televoting
expect_success "deadline set apply"
[[ "$(printf '%s' "$HTTP_BODY" | json_value deadlineRevision)" == "1" ]] || fail "deadline did not enter V3 authority revision 1"

log "Open the round through the existing governed lifecycle authority"
rpc "$ORGANIZER_TOKEN" studio2_round_status_change_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"open\"}" televoting
expect_success "round open preview"
OPEN_GLOBAL="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
OPEN_ROUND="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
rpc "$ORGANIZER_TOKEN" studio2_apply_round_status_change "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"open\",\"p_operation_id\":\"17000000-0000-4000-8000-000000000011\",\"p_idempotency_key\":\"s14-round-open\",\"p_expected_global_version\":$OPEN_GLOBAL,\"p_expected_round_version\":$OPEN_ROUND}" televoting
expect_success "round open apply"
[[ "$(db_scalar "select status::text||':'||voting_deadline_revision from televoting.rounds where id='$ROUND_ID'::uuid;")" == "open:1" ]] || fail "round is not open under canonical deadline authority"

BALLOT='[{"target_country_code":"D01","points":6},{"target_country_code":"D02","points":5},{"target_country_code":"D03","points":4},{"target_country_code":"D04","points":3},{"target_country_code":"D05","points":2}]'
BALLOT_MAP='{"D01":6,"D02":5,"D03":4,"D04":3,"D05":2}'
seed_preflight() {
  local id="$1" username="$2" country="$3"
  db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,risk_score,severity,requires_attestation,findings,technical_signals,history_summary,expires_at)
values ('$id'::uuid,'$ROUND_ID'::uuid,lower('$username'),'$country','$BALLOT_MAP'::jsonb,0,'none',false,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,now()+interval '30 minutes');"
}

log "A ballot before the persisted deadline is accepted"
seed_preflight '17000000-0000-4000-8000-000000000020' 'deadline-before' 'D06'
rpc "$ANON_KEY" submit_vote_checked "{\"p_round_id\":\"$ROUND_ID\",\"p_username\":\"deadline-before\",\"p_country_code\":\"D06\",\"p_entries\":$BALLOT,\"p_preflight_token\":\"17000000-0000-4000-8000-000000000020\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}" televoting
expect_success "ballot before canonical deadline"

log "Let database server time cross the real deadline"
sleep 4
seed_preflight '17000000-0000-4000-8000-000000000021' 'deadline-after' 'D07'
rpc "$ANON_KEY" submit_vote_checked "{\"p_round_id\":\"$ROUND_ID\",\"p_username\":\"deadline-after\",\"p_country_code\":\"D07\",\"p_entries\":$BALLOT,\"p_preflight_token\":\"17000000-0000-4000-8000-000000000021\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}" televoting
expect_failure "ballot after canonical deadline"
[[ "$HTTP_BODY" == *"Voting deadline has passed"* ]] || fail "expired ballot was not rejected by server-time deadline: $HTTP_BODY"
[[ "$(db_scalar "select status::text from televoting.rounds where id='$ROUND_ID'::uuid;")" == "open" ]] || fail "deadline expiry incorrectly changed lifecycle state"
OPENED_AT_BEFORE="$(db_scalar "select opened_at::text from televoting.rounds where id='$ROUND_ID'::uuid;")"
CLOSED_AT_BEFORE="$(db_scalar "select coalesce(closed_at::text,'') from televoting.rounds where id='$ROUND_ID'::uuid;")"

log "Preview and apply a genuine extension without close/reopen"
rpc "$ORGANIZER_TOKEN" studio2_round_deadline_extension_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_extend_seconds\":120}" televoting
expect_success "deadline extension preview"
[[ "$(printf '%s' "$HTTP_BODY" | json_value blockers)" == "[]" ]] || fail "extension preview blockers: $HTTP_BODY"
EXT_GLOBAL="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
EXT_ROUND="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
PREVIOUS_DEADLINE="$(printf '%s' "$HTTP_BODY" | json_value previousDeadline)"
NEW_DEADLINE="$(printf '%s' "$HTTP_BODY" | json_value newDeadline)"
rpc "$ORGANIZER_TOKEN" studio2_apply_round_deadline_extension "{\"p_round_id\":\"$ROUND_ID\",\"p_extend_seconds\":120,\"p_operation_id\":\"17000000-0000-4000-8000-000000000012\",\"p_idempotency_key\":\"s14-genuine-extension\",\"p_expected_global_version\":$EXT_GLOBAL,\"p_expected_round_version\":$EXT_ROUND}" televoting
expect_success "deadline extension apply"
[[ "$(printf '%s' "$HTTP_BODY" | json_value previousDeadline)" == "$PREVIOUS_DEADLINE" ]] || fail "extension receipt previous deadline mismatch"
[[ "$(printf '%s' "$HTTP_BODY" | json_value newDeadline)" == "$NEW_DEADLINE" ]] || fail "extension receipt new deadline mismatch"
[[ "$(printf '%s' "$HTTP_BODY" | json_value deadlineRevision)" == "2" ]] || fail "extension did not increment deadline revision"
[[ "$(db_scalar "select status::text from televoting.rounds where id='$ROUND_ID'::uuid;")" == "open" ]] || fail "extension changed round lifecycle state"
[[ "$(db_scalar "select opened_at::text from televoting.rounds where id='$ROUND_ID'::uuid;")" == "$OPENED_AT_BEFORE" ]] || fail "extension rewrote opened_at"
[[ "$(db_scalar "select coalesce(closed_at::text,'') from televoting.rounds where id='$ROUND_ID'::uuid;")" == "$CLOSED_AT_BEFORE" ]] || fail "extension rewrote closed_at"

log "The previously expired ballot is valid during the extended period"
rpc "$ANON_KEY" submit_vote_checked "{\"p_round_id\":\"$ROUND_ID\",\"p_username\":\"deadline-after\",\"p_country_code\":\"D07\",\"p_entries\":$BALLOT,\"p_preflight_token\":\"17000000-0000-4000-8000-000000000021\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}" televoting
expect_success "ballot during genuine extension"

log "Exact retry returns the durable operation result without extending twice"
REVISION_BEFORE_REPLAY="$(db_scalar "select voting_deadline_revision from televoting.rounds where id='$ROUND_ID'::uuid;")"
EVENTS_BEFORE_REPLAY="$(db_scalar "select count(*) from private.v3_domain_events where operation_id='17000000-0000-4000-8000-000000000012'::uuid and event_type='televote.extended';")"
rpc "$ORGANIZER_TOKEN" studio2_apply_round_deadline_extension "{\"p_round_id\":\"$ROUND_ID\",\"p_extend_seconds\":120,\"p_operation_id\":\"17000000-0000-4000-8000-000000000012\",\"p_idempotency_key\":\"s14-genuine-extension\",\"p_expected_global_version\":$EXT_GLOBAL,\"p_expected_round_version\":$EXT_ROUND}" televoting
expect_success "idempotent extension replay"
[[ "$(db_scalar "select voting_deadline_revision from televoting.rounds where id='$ROUND_ID'::uuid;")" == "$REVISION_BEFORE_REPLAY" ]] || fail "idempotent retry extended the window twice"
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='17000000-0000-4000-8000-000000000012'::uuid and event_type='televote.extended';")" == "$EVENTS_BEFORE_REPLAY" ]] || fail "idempotent retry duplicated the canonical extension event"

log "A different operation carrying the stale preview versions fails closed"
rpc "$ORGANIZER_TOKEN" studio2_apply_round_deadline_extension "{\"p_round_id\":\"$ROUND_ID\",\"p_extend_seconds\":30,\"p_operation_id\":\"17000000-0000-4000-8000-000000000013\",\"p_idempotency_key\":\"s14-stale-extension\",\"p_expected_global_version\":$EXT_GLOBAL,\"p_expected_round_version\":$EXT_ROUND}" televoting
expect_failure "stale extension"
[[ "$HTTP_BODY" == *"state changed"* ]] || fail "stale extension did not surface concurrency failure: $HTTP_BODY"

log "Canonical event, outbox and durable receipt retain exact extension provenance"
[[ "$(db_scalar "select count(*) from public.studio2_operation_receipts where operation_id='17000000-0000-4000-8000-000000000012'::uuid and command='televote.round.extend_deadline' and status='succeeded';")" == "1" ]] || fail "extension receipt missing"
[[ "$(db_scalar "select count(*) from private.v3_domain_events where operation_id='17000000-0000-4000-8000-000000000012'::uuid and event_type='televote.extended' and payload->>'previousDeadline' is not null and payload->>'newDeadline' is not null and payload->>'deadlineRevision'='2';")" == "1" ]] || fail "canonical televote.extended event missing exact provenance"
[[ "$(db_scalar "select count(*) from private.v3_domain_event_outbox o join private.v3_domain_events e on e.id=o.event_id where e.operation_id='17000000-0000-4000-8000-000000000012'::uuid and e.event_type='televote.extended' and o.consumer_key='televote.tasks';")" == "1" ]] || fail "extension task consequence outbox missing"

log "Direct authenticated deadline mutation remains outside the authority"
db_expect_failure "direct authenticated deadline write" "begin; set local role authenticated; update televoting.rounds set voting_deadline_at=now()+interval '1 hour' where id='$ROUND_ID'::uuid; rollback;"

log "S14 genuine Televote deadline authority rehearsal passed"
