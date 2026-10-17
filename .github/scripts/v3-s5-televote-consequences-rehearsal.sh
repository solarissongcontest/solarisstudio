#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-televote-consequences] %s\n' "$*"; }
fail() { printf '\n[v3-s5-televote-consequences] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

HTTP_STATUS=''
HTTP_BODY=''

json_value() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1].split(".") if sys.argv[1] else []
value = json.load(sys.stdin)
for key in path:
    value = value[int(key)] if isinstance(value, list) else value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

televote_rpc_request() {
  local token="$1" api_key="$2" function_name="$3" body="$4" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' \
    -X POST "$API_URL/rest/v1/rpc/$function_name" \
    -H "apikey: $api_key" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -H "Content-Profile: televoting" \
    -H "Accept-Profile: televoting" \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

expect_json() {
  local label="$1" path="$2" expected="$3" actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got '$actual' from $HTTP_BODY"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_exec() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "set \"request.jwt.claim.role\"='service_role'; $1" >/dev/null
}
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"
}
expect_db_failure() {
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

claim_and_process() {
  local consumer_key="$1" worker_id="$2" expected_event_id="$3" claimed event_id
  claimed="$(service_value "select event_id::text from public.studio2_claim_domain_event_deliveries('$consumer_key','$worker_id',100,60);")"
  printf '%s\n' "$claimed" | grep -Fxq "$expected_event_id" \
    || fail "$consumer_key could not claim expected event $expected_event_id"

  while IFS= read -r event_id; do
    [[ -n "$event_id" ]] || continue
    service_exec "select public.studio2_process_televote_domain_event('$event_id'::uuid,'$consumer_key','$worker_id');"
  done <<< "$claimed"
}

SOLARIS_EDITION_ID='00000000-0000-4000-8000-00000000e671'
TV_EDITION_ID='00000000-0000-4000-8000-00000000e672'
ROUND_ID='00000000-0000-4000-8000-00000000a671'
DEADLINE_OPERATION_ID='00000000-0000-4000-8000-00000000d670'
OPEN_OPERATION_ID='00000000-0000-4000-8000-00000000d671'
PREFLIGHT_ID='00000000-0000-4000-8000-00000000f671'
CLOSE_OPERATION_ID='00000000-0000-4000-8000-00000000d672'
DEADLINE="$(date -u -d '+2 hours' '+%Y-%m-%dT%H:%M:%SZ')"
BALLOT='[{"target_country_code":"T5A","points":6},{"target_country_code":"T5B","points":5},{"target_country_code":"T5C","points":4},{"target_country_code":"T5D","points":3},{"target_country_code":"T5E","points":2}]'
BALLOT_MAP='{"T5A":6,"T5B":5,"T5C":4,"T5D":3,"T5E":2}'

log "Seeding one isolated linked Televote round"
db_exec "insert into public.editions(id,name,year,slug,edition_number,status,published) values ('$SOLARIS_EDITION_ID','S5 Televote Consequences',2026,'s5-televote-consequences',9962,'active',false) on conflict (id) do nothing;"
db_exec "insert into televoting.editions(id,name,is_active,is_archived) values ('$TV_EDITION_ID','S5 Televote Consequences',true,false) on conflict (id) do update set is_active=true,is_archived=false;"
db_exec "insert into public.integration_links(service,entity_type,solaris_id,remote_id,edition_id,sync_status,metadata,last_synced_at) values ('televoting','edition','$SOLARIS_EDITION_ID'::uuid,'$TV_EDITION_ID','$SOLARIS_EDITION_ID'::uuid,'linked','{\"source\":\"s5-televote-consequence-rehearsal\"}'::jsonb,now()) on conflict (service,entity_type,remote_id) do update set solaris_id=excluded.solaris_id,edition_id=excluded.edition_id,sync_status='linked',metadata=excluded.metadata,last_synced_at=now(),updated_at=now();"
db_exec "insert into televoting.countries(code,name,flag) values ('T5A','S5 Televote A','A'),('T5B','S5 Televote B','B'),('T5C','S5 Televote C','C'),('T5D','S5 Televote D','D'),('T5E','S5 Televote E','E'),('T5V','S5 Televote Voter','V') on conflict (code) do nothing;"
db_exec "insert into televoting.rounds(id,edition_id,name,status,total_points_to_distribute,participant_mode,self_voting_mode) values ('$ROUND_ID','$TV_EDITION_ID','S5 Televote Round','draft',20,'countries','unrestricted') on conflict (id) do nothing;"
db_exec "insert into televoting.round_entries(round_id,entry_type,entry_key,country_code,short_name,entry_code,display_order) values ('$ROUND_ID','country','T5A','T5A','T5A','T5A',1),('$ROUND_ID','country','T5B','T5B','T5B','T5B',2),('$ROUND_ID','country','T5C','T5C','T5C','T5C',3),('$ROUND_ID','country','T5D','T5D','T5D','T5D',4),('$ROUND_ID','country','T5E','T5E','T5E','T5E',5) on conflict (round_id,entry_key) do nothing;"
db_exec "insert into public.televoting_round_bindings(remote_round_id,remote_edition_id,edition_id,show_id,source_mode,last_synced_at,frozen_at,created_at,updated_at) values ('$ROUND_ID','$TV_EDITION_ID','$SOLARIS_EDITION_ID'::uuid,null,'edition',now(),null,now(),now()) on conflict (remote_round_id) do update set remote_edition_id=excluded.remote_edition_id,edition_id=excluded.edition_id,show_id=null,source_mode='edition',last_synced_at=now(),frozen_at=null,updated_at=now();"

log "Setting the required server deadline through the governed R2 operation"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_round_deadline_change_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_new_deadline_at\":\"$DEADLINE\"}"
expect_success "Televote deadline preview"
expect_json "Televote deadline blockers" blockers '[]'
DEADLINE_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_apply_round_deadline_change "{\"p_round_id\":\"$ROUND_ID\",\"p_new_deadline_at\":\"$DEADLINE\",\"p_operation_id\":\"$DEADLINE_OPERATION_ID\",\"p_idempotency_key\":\"s5-televote-deadline\",\"p_expected_round_version\":$DEADLINE_VERSION}"
expect_success "governed Televote deadline set"

log "Opening Televote through the governed R2 operation emits one canonical fact"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_round_status_change_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"open\"}"
expect_success "Televote open preview"
expect_json "Televote open blockers" blockers '[]'
GLOBAL_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
ROUND_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_apply_round_status_change "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"open\",\"p_operation_id\":\"$OPEN_OPERATION_ID\",\"p_idempotency_key\":\"s5-televote-open\",\"p_expected_global_version\":$GLOBAL_VERSION,\"p_expected_round_version\":$ROUND_VERSION}"
expect_success "governed Televote open"
expect_json "Televote open result" status open
OPEN_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$OPEN_OPERATION_ID'::uuid and event_type='televote.opened';")"
[[ -n "$OPEN_EVENT_ID" ]] || fail "televote.opened DomainEvent missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT_ID'::uuid and consumer_key in ('televote.tasks','televote.notifications');")" == '2' ]] || fail "televote.opened did not create both consequence deliveries"
claim_and_process 'televote.tasks' 's5-televote-open-task-worker' "$OPEN_EVENT_ID"
claim_and_process 'televote.notifications' 's5-televote-open-notification-worker' "$OPEN_EVENT_ID"
[[ "$(service_value "select public.studio2_process_televote_domain_event('$OPEN_EVENT_ID'::uuid,'televote.tasks','s5-televote-open-replay-worker')->>'replayed';")" == 'true' ]] || fail "Televote open task replay was not idempotent"

log "Exact Televote open replay does not duplicate events or deliveries"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_apply_round_status_change "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"open\",\"p_operation_id\":\"$OPEN_OPERATION_ID\",\"p_idempotency_key\":\"s5-televote-open\",\"p_expected_global_version\":$GLOBAL_VERSION,\"p_expected_round_version\":$ROUND_VERSION}"
expect_success "exact Televote open replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OPEN_OPERATION_ID'::uuid and event_type='televote.opened';")" == '1' ]] || fail "Televote open replay duplicated its DomainEvent"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$OPEN_EVENT_ID'::uuid;")" == '2' ]] || fail "Televote open replay duplicated deliveries"

log "Submitting a real public ballot emits a receipt-backed ballot fact without ballot contents"
db_exec "insert into televoting.vote_preflight_checks(id,round_id,username_normalized,country_code,ballot_map,risk_score,severity,requires_attestation,findings,technical_signals,channel,canonical_edition_id,expires_at) values ('$PREFLIGHT_ID','$ROUND_ID','s5-televote-voter','T5V','$BALLOT_MAP'::jsonb,0,'none',false,'[]'::jsonb,'[]'::jsonb,'televote','$SOLARIS_EDITION_ID'::uuid,now()+interval '30 minutes');"
televote_rpc_request "$ANON_KEY" "$ANON_KEY" submit_vote_checked "{\"p_round_id\":\"$ROUND_ID\",\"p_username\":\"s5-televote-voter\",\"p_country_code\":\"T5V\",\"p_entries\":$BALLOT,\"p_preflight_token\":\"$PREFLIGHT_ID\",\"p_ip_hash\":null,\"p_fingerprint_hash\":null,\"p_device_token_hash\":null,\"p_ip_country\":null,\"p_is_vpn\":false}"
expect_success "public Televote ballot submit"
expect_json "public Televote ballot status" status active
SUBMISSION_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
[[ -n "$SUBMISSION_ID" ]] || fail "Televote submit returned no submission id"
[[ "$(db_value "select command || ':' || status from public.studio2_operation_receipts where operation_id='$PREFLIGHT_ID'::uuid;")" == 'televote.submit:succeeded' ]] || fail "Televote ballot was not bridged into the canonical S2 receipt"
BALLOT_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$PREFLIGHT_ID'::uuid and event_type='televote.ballot_submitted';")"
[[ -n "$BALLOT_EVENT_ID" ]] || fail "televote.ballot_submitted DomainEvent missing"
[[ "$(db_value "select aggregate_type || ':' || aggregate_id from private.v3_domain_events where id='$BALLOT_EVENT_ID'::uuid;")" == "televote_ballot:$SUBMISSION_ID" ]] || fail "Televote ballot aggregate provenance is wrong"
[[ "$(db_value "select payload ? 'points' or payload ? 'ballot' or payload ? 'entries' from private.v3_domain_events where id='$BALLOT_EVENT_ID'::uuid;")" == 'f' ]] || fail "Televote DomainEvent leaked ballot contents"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$BALLOT_EVENT_ID'::uuid and consumer_key='televote.tasks';")" == '1' ]] || fail "televote.ballot_submitted task delivery missing"
claim_and_process 'televote.tasks' 's5-televote-ballot-task-worker' "$BALLOT_EVENT_ID"

log "Closing Televote through the governed R2 operation emits televote.closed"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_round_status_change_preview "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"closed\"}"
expect_success "Televote close preview"
GLOBAL_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedGlobalVersion)"
ROUND_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedRoundVersion)"
televote_rpc_request "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" studio2_apply_round_status_change "{\"p_round_id\":\"$ROUND_ID\",\"p_status\":\"closed\",\"p_operation_id\":\"$CLOSE_OPERATION_ID\",\"p_idempotency_key\":\"s5-televote-close\",\"p_expected_global_version\":$GLOBAL_VERSION,\"p_expected_round_version\":$ROUND_VERSION}"
expect_success "governed Televote close"
expect_json "Televote close result" status closed
CLOSE_EVENT_ID="$(db_value "select id from private.v3_domain_events where operation_id='$CLOSE_OPERATION_ID'::uuid and event_type='televote.closed';")"
[[ -n "$CLOSE_EVENT_ID" ]] || fail "televote.closed DomainEvent missing"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$CLOSE_EVENT_ID'::uuid and consumer_key='televote.tasks';")" == '1' ]] || fail "televote.closed task delivery missing"
claim_and_process 'televote.tasks' 's5-televote-close-task-worker' "$CLOSE_EVENT_ID"

log "Browser roles cannot invoke Televote consequence consumers"
expect_db_failure "authenticated Televote consequence processing" "set role authenticated; set \"request.jwt.claim.role\"='authenticated'; select public.studio2_process_televote_domain_event('$CLOSE_EVENT_ID'::uuid,'televote.tasks','browser-worker');"

log "System V3 S5 Televote consequence rehearsal passed"
