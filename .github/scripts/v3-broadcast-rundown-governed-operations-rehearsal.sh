#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-broadcast-rundown] %s\n' "$*"; }
fail() { printf '\n[v3-broadcast-rundown] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal: $DB_URL" ;; esac

PASSWORD='V3BroadcastRundown2026!'
EMAIL='v3-broadcast-rundown@solaris.invalid'
EDITION_ID='00000000-0000-4000-8000-00000000b711'
OTHER_EDITION_ID='00000000-0000-4000-8000-00000000b712'
SHOW_ID='00000000-0000-4000-8000-00000000b713'
OP_SAVE='00000000-0000-4000-8000-00000000b721'
OP_STALE='00000000-0000-4000-8000-00000000b722'
OP_LOCK='00000000-0000-4000-8000-00000000b723'
OP_LOCK_NOOP='00000000-0000-4000-8000-00000000b724'
OP_READY_DENIED='00000000-0000-4000-8000-00000000b725'
OP_READY='00000000-0000-4000-8000-00000000b726'
OP_LIVE='00000000-0000-4000-8000-00000000b727'
HTTP_STATUS=''
HTTP_BODY=''
TOKEN=''
USER_ID=''

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  if [[ -n "$data" ]]; then
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" \
      -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json' \
      --data "$data")"
  else
    HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $api_key" \
      -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json')"
  fi
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

db_exec() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }

json_value() {
  local key="$1"
  python3 - "$HTTP_BODY" "$key" <<'PY'
import json,sys
value=json.loads(sys.argv[1])
for part in sys.argv[2].split('.'):
    if isinstance(value,dict): value=value.get(part)
    else: value=None; break
if value is True: print('true')
elif value is False: print('false')
elif value is None: print('')
else: print(value)
PY
}

rpc() {
  local name="$1" data="$2"
  request POST "$API_URL/rest/v1/rpc/$name" "$TOKEN" "$ANON_KEY" "$data"
}

log "Create a real local Auth session so the governed RPCs exercise active-session validation"
request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" \
  "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\",\"email_confirm\":true}"
expect_success "create local broadcast operator"
USER_ID="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["id"])' <<<"$HTTP_BODY")"
request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
  "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
expect_success "sign in local broadcast operator"
TOKEN="$(python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])' <<<"$HTTP_BODY")"
[[ -n "$TOKEN" && -n "$USER_ID" ]] || fail "Local Auth session setup did not return token/user id"

log "Seed two editions, one show, and manage/read authority only"
db_exec "
insert into public.editions(id,name,slug,edition_number,status,published) values
  ('$EDITION_ID','V3 Broadcast Rundown','v3-broadcast-rundown',99711,'active',false),
  ('$OTHER_EDITION_ID','V3 Broadcast Other','v3-broadcast-other',99712,'planning',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,broadcast_config)
values ('$SHOW_ID','$EDITION_ID','V3 Broadcast Final','final',1,false,'{}'::jsonb);
insert into public.studio2_capability_grants(user_id,capability,edition_id) values
  ('$USER_ID','broadcast.read','$EDITION_ID'),
  ('$USER_ID','broadcast.manage','$EDITION_ID')
on conflict do nothing;
"

log "Exact-scope snapshot starts at revision zero"
rpc studio2_broadcast_rundown_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_success "exact-scope rundown snapshot"
[[ "$(json_value revision)" == '0' ]] || fail "Initial rundown revision is not zero: $HTTP_BODY"

log "Cross-edition scope is rejected even though the Show id exists"
rpc studio2_broadcast_rundown_v3 "{\"p_edition_id\":\"$OTHER_EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_failure "cross-edition rundown read"

SEGMENTS='[{"id":"opening","label":"Opening sequence","status":"planned","plannedDurationSeconds":180}]'
SAVE_PAYLOAD="{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":0,\"p_start_at\":\"2030-01-01T20:00:00Z\",\"p_segments\":$SEGMENTS,\"p_reason\":\"Initial governed rundown\",\"p_operation_id\":\"$OP_SAVE\",\"p_idempotency_key\":\"broadcast-save-1\"}"

log "Governed structure save creates revision one, durable receipt and one DomainEvent"
rpc studio2_save_broadcast_rundown_v3 "$SAVE_PAYLOAD"
expect_success "governed rundown save"
[[ "$(json_value revision)" == '1' ]] || fail "Save did not create revision one: $HTTP_BODY"
[[ "$(json_value receiptId)" == "$OP_SAVE" ]] || fail "Save did not expose durable receipt identity"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_SAVE'::uuid and event_type='show.changed' and aggregate_type='live-show' and aggregate_version=1;")" == '1' ]] || fail "Save did not emit exactly one correlated show.changed fact"
[[ "$(db_value "select count(*) from public.admin_audit_log where action='broadcast.rundown_updated' and record_id='$SHOW_ID';")" == '1' ]] || fail "Save audit evidence missing"

log "Exact same operation replay returns prior authoritative result without duplicating facts"
rpc studio2_save_broadcast_rundown_v3 "$SAVE_PAYLOAD"
expect_success "exact rundown save replay"
[[ "$(json_value replayed)" == 'true' ]] || fail "Replay was not identified as replayed"
[[ "$(json_value reconciled)" == 'true' ]] || fail "Replay was not identified as reconciled"
[[ "$(json_value revision)" == '1' ]] || fail "Replay changed revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_SAVE'::uuid;")" == '1' ]] || fail "Replay duplicated DomainEvent"

log "Same idempotency identity with changed semantics is rejected"
ALTERED_PAYLOAD="${SAVE_PAYLOAD/2030-01-01T20:00:00Z/2030-01-01T20:05:00Z}"
rpc studio2_save_broadcast_rundown_v3 "$ALTERED_PAYLOAD"
expect_failure "changed semantic replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_SAVE'::uuid;")" == '1' ]] || fail "Changed replay duplicated DomainEvent"

log "A stale expected revision rolls back its claimed operation"
rpc studio2_save_broadcast_rundown_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":0,\"p_start_at\":\"2030-01-01T20:10:00Z\",\"p_segments\":$SEGMENTS,\"p_reason\":\"Stale governed rundown\",\"p_operation_id\":\"$OP_STALE\",\"p_idempotency_key\":\"broadcast-save-stale\"}"
expect_failure "stale rundown save"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OP_STALE'::uuid;")" == '0' ]] || fail "Stale failed command escaped transactional rollback"
[[ "$(db_value "select coalesce((broadcast_config->'studio2Rundown'->>'revision')::integer,-1) from public.shows where id='$SHOW_ID';")" == '1' ]] || fail "Stale command changed canonical revision"

log "Lock uses broadcast.manage and advances revision exactly once"
rpc studio2_set_broadcast_rundown_lock_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":1,\"p_locked\":true,\"p_reason\":\"Lock for broadcast\",\"p_operation_id\":\"$OP_LOCK\",\"p_idempotency_key\":\"broadcast-lock-1\"}"
expect_success "governed rundown lock"
[[ "$(json_value revision)" == '2' && "$(json_value changed)" == 'true' ]] || fail "Lock did not advance to revision two"

log "A second desired-state lock produces a receipt but no fake state-change event"
rpc studio2_set_broadcast_rundown_lock_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":2,\"p_locked\":true,\"p_reason\":\"Confirm locked state\",\"p_operation_id\":\"$OP_LOCK_NOOP\",\"p_idempotency_key\":\"broadcast-lock-noop\"}"
expect_success "governed no-op lock"
[[ "$(json_value revision)" == '2' && "$(json_value changed)" == 'false' ]] || fail "No-op lock changed canonical state"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_LOCK_NOOP'::uuid;")" == '0' ]] || fail "No-op lock fabricated a DomainEvent"
[[ "$(db_value "select status from public.studio2_operation_receipts where operation_id='$OP_LOCK_NOOP'::uuid;")" == 'succeeded' ]] || fail "No-op lock did not leave a durable successful receipt"

log "Manage authority alone cannot perform live segment control"
rpc studio2_transition_broadcast_segment_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":2,\"p_segment_id\":\"opening\",\"p_to_status\":\"ready\",\"p_reason\":\"Prepare live opening\",\"p_operation_id\":\"$OP_READY_DENIED\",\"p_idempotency_key\":\"broadcast-ready-denied\"}"
expect_failure "segment transition without broadcast.control"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OP_READY_DENIED'::uuid;")" == '0' ]] || fail "Unauthorized command created an operation receipt"

db_exec "insert into public.studio2_capability_grants(user_id,capability,edition_id) values ('$USER_ID','broadcast.control','$EDITION_ID') on conflict do nothing;"

log "broadcast.control advances planned -> ready -> live under revision CAS"
rpc studio2_transition_broadcast_segment_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":2,\"p_segment_id\":\"opening\",\"p_to_status\":\"ready\",\"p_reason\":\"Prepare live opening\",\"p_operation_id\":\"$OP_READY\",\"p_idempotency_key\":\"broadcast-ready-1\"}"
expect_success "segment ready transition"
[[ "$(json_value revision)" == '3' && "$(json_value toStatus)" == 'ready' ]] || fail "Ready transition did not create revision three"
rpc studio2_transition_broadcast_segment_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\",\"p_expected_revision\":3,\"p_segment_id\":\"opening\",\"p_to_status\":\"live\",\"p_reason\":\"Take opening live\",\"p_operation_id\":\"$OP_LIVE\",\"p_idempotency_key\":\"broadcast-live-1\"}"
expect_success "segment live transition"
[[ "$(json_value revision)" == '4' && "$(json_value toStatus)" == 'live' ]] || fail "Live transition did not create revision four"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='live-show' and aggregate_id='$SHOW_ID' and event_type='show.changed';")" == '4' ]] || fail "Actual mutation history does not contain exactly four show.changed facts"
[[ "$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID' and entity_type='broadcast_segment' and entity_id='$SHOW_ID:opening' and type='broadcast.segment_started';")" == '1' ]] || fail "Legacy segment-start compatibility event missing"

log "Lost-response reconciliation returns the authoritative successful live result"
rpc studio2_reconcile_operation "{\"p_operation_id\":\"$OP_LIVE\"}"
expect_success "reconcile live segment operation"
[[ "$(json_value status)" == 'succeeded' ]] || fail "Reconciled operation is not succeeded"
[[ "$(json_value result.revision)" == '4' ]] || fail "Reconciled result does not contain revision four"
[[ "$(json_value result.receiptId)" == "$OP_LIVE" ]] || fail "Reconciled result lost durable receipt identity"

log "Final exact-scope snapshot reconstructs canonical state from the Show row"
rpc studio2_broadcast_rundown_v3 "{\"p_edition_id\":\"$EDITION_ID\",\"p_show_id\":\"$SHOW_ID\"}"
expect_success "final rundown snapshot"
[[ "$(json_value revision)" == '4' ]] || fail "Final snapshot does not expose revision four"
[[ "$(json_value rundown.version)" == '2' ]] || fail "Governed write broke version-2 compatibility contract"

log "System V3 Broadcast Rundown governed-operation rehearsal passed"
