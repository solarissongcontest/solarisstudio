#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-uncertain-operation] %s\n' "$*"; }
fail() { printf '\n[v3-s11-uncertain-operation] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

json_value() {
  local path="$1"
  python3 -c '
import json, sys
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
elif isinstance(value,(dict,list)): print(json.dumps(value,separators=(",",":"),sort_keys=True))
else: print(value)
' "$path"
}

create_user() {
  local email="$1" body response
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":"V3S11Uncertain2026!","email_confirm":True}))' "$email")"
  response="$(curl -sS -f -X POST "$API_URL/auth/v1/admin/users" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$body")"
  printf '%s' "$response" | json_value id
}

claims_sql() {
  local actor="$1"
  printf "select set_config('request.jwt.claims', jsonb_build_object('sub','%s','role','authenticated')::text, true);" "$actor"
}

db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
expect_db_failure() {
  local label="$1" sql="$2" expected="$3" output
  if output="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$sql" 2>&1)"; then
    fail "$label unexpectedly succeeded"
  fi
  [[ "$output" == *"$expected"* ]] || fail "$label failed without $expected: $output"
  log "PASS: $label rejected as $expected"
}

ACTOR_OPERATION='00000000-0000-4000-8000-00000000b120'
RETRY_OPERATION='00000000-0000-4000-8000-00000000b121'
CORRELATION_ID='00000000-0000-4000-8000-00000000c120'
KEY='s11-uncertain-operation-key'
REQUEST="'{\"fixture\":\"uncertain-recovery\",\"version\":1}'::jsonb"
SCOPE="'{\"editionId\":\"00000000-0000-4000-8000-00000000e120\"}'::jsonb"

log "Create two isolated authenticated actors"
ACTOR_A="$(create_user v3-s11-uncertain-a@solaris.invalid)"
ACTOR_B="$(create_user v3-s11-uncertain-b@solaris.invalid)"
[[ -n "$ACTOR_A" && -n "$ACTOR_B" ]] || fail "auth fixture creation failed"

log "Claim one canonical operation and mark its outcome uncertain"
CLAIM="$(db_value "begin; $(claims_sql "$ACTOR_A") select private.studio2_claim_operation('$ACTOR_OPERATION'::uuid,'$KEY','$CORRELATION_ID'::uuid,'system.operation_receipt.rehearse','R2',$SCOPE,$REQUEST); commit;")"
[[ "$(printf '%s' "$CLAIM" | tail -n 1 | json_value replayed)" == 'false' ]] || fail "first claim was unexpectedly replayed"
UNCERTAIN="$(db_value "begin; $(claims_sql "$ACTOR_A") select private.studio2_mark_operation_uncertain('$ACTOR_OPERATION'::uuid,'TIMEOUT','{\"dependency\":\"s11-fixture\"}'::jsonb); commit;")"
[[ "$(printf '%s' "$UNCERTAIN" | tail -n 1 | json_value status)" == 'uncertain' ]] || fail "operation did not become uncertain"

log "Canonical reconciliation reports uncertainty instead of fabricating success"
RECONCILED="$(db_value "begin; set local role authenticated; $(claims_sql "$ACTOR_A") select public.studio2_reconcile_operation('$ACTOR_OPERATION'::uuid); commit;")"
RECONCILED_JSON="$(printf '%s' "$RECONCILED" | tail -n 1)"
[[ "$(printf '%s' "$RECONCILED_JSON" | json_value status)" == 'uncertain' ]] || fail "reconciliation did not preserve uncertain status: $RECONCILED_JSON"
[[ "$(printf '%s' "$RECONCILED_JSON" | json_value error.code)" == 'TIMEOUT' ]] || fail "reconciliation lost canonical uncertainty reason"
[[ "$(printf '%s' "$RECONCILED_JSON" | json_value result)" == '' ]] || fail "uncertain reconciliation fabricated a result"

log "Same semantic retry returns the original uncertain operation"
REPLAY="$(db_value "begin; $(claims_sql "$ACTOR_A") select private.studio2_claim_operation('$RETRY_OPERATION'::uuid,'$KEY','00000000-0000-4000-8000-00000000c121'::uuid,'system.operation_receipt.rehearse','R2',$SCOPE,$REQUEST); commit;")"
REPLAY_JSON="$(printf '%s' "$REPLAY" | tail -n 1)"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value replayed)" == 'true' ]] || fail "same semantic retry was not replayed"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value operationId)" == "$ACTOR_OPERATION" ]] || fail "retry created or returned a different operation"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value status)" == 'uncertain' ]] || fail "retry hid the uncertain state"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$ACTOR_A'::uuid and command='system.operation_receipt.rehearse' and idempotency_key='$KEY';")" == '1' ]] || fail "retry amplified the receipt ledger"

log "Changed semantic retry is still rejected and uncertain cannot be promoted to success"
expect_db_failure \
  "changed request after uncertainty" \
  "begin; $(claims_sql "$ACTOR_A") select private.studio2_claim_operation('$RETRY_OPERATION'::uuid,'$KEY','$CORRELATION_ID'::uuid,'system.operation_receipt.rehearse','R2',$SCOPE,'{\"fixture\":\"uncertain-recovery\",\"version\":2}'::jsonb); rollback;" \
  'IDEMPOTENCY_CONFLICT'
expect_db_failure \
  "uncertain completion as success" \
  "begin; $(claims_sql "$ACTOR_A") select private.studio2_complete_operation('$ACTOR_OPERATION'::uuid,'{\"state\":\"invented-success\"}'::jsonb); rollback;" \
  'STATE_CHANGED'

log "Another actor cannot reconcile the receipt"
expect_db_failure \
  "foreign uncertain reconciliation" \
  "begin; set local role authenticated; $(claims_sql "$ACTOR_B") select public.studio2_reconcile_operation('$ACTOR_OPERATION'::uuid); rollback;" \
  'UNKNOWN'

log "System V3 S11 uncertain-operation recovery rehearsal passed"
