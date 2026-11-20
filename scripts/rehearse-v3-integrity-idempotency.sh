#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "[v3-integrity-idempotency] FAIL: $*" >&2; exit 1; }
eval "$(supabase status -o env)"
: "${API_URL:?missing isolated Supabase API URL}"
: "${DB_URL:?missing isolated Supabase DB URL}"
: "${ANON_KEY:?missing isolated Supabase anonymous key}"

# No hosted API, proxy, alternate hostname or libpq host override is allowed.
api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'
db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
[[ "$API_URL" =~ $api_pattern ]] || fail "Refusing hosted Supabase API"
[[ "$DB_URL" =~ $db_pattern ]] || fail "Refusing hosted Supabase database"

KEY='0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'
OPERATION='00000000-0000-4000-8000-00000000c161'
OTHER_OPERATION='00000000-0000-4000-8000-00000000c162'
HTTP_STATUS=''
HTTP_BODY=''

rpc() {
  local id="$1" summary="$2"
  local body
  body="$(python3 - "$id" "$KEY" "$summary" <<'PY'
import json,sys
print(json.dumps({
  "p_operation_id":sys.argv[1],
  "p_idempotency_key":sys.argv[2],
  "p_category":"conduct",
  "p_summary":sys.argv[3],
  "p_details":"An isolated test report with sufficiently detailed facts for validation.",
  "p_observed_facts":"One concrete observation in the disposable fixture.",
  "p_uncertainties":"The exact real-world intent is unknown.",
  "p_related_countries":[],
  "p_edition_reference":None,
  "p_case_kind":"report",
}))
PY
)"
  local result
  result="$(mktemp)"
  HTTP_STATUS="$(curl --silent --show-error --output "$result" --write-out '%{http_code}' \
    --request POST "$API_URL/rest/v1/rpc/v3_public_create_anonymous_integrity_case" \
    --header "apikey: $ANON_KEY" \
    --header "Authorization: Bearer $ANON_KEY" \
    --header 'Content-Type: application/json' \
    --data "$body")"
  HTTP_BODY="$(cat "$result")"
  rm -f "$result"
}

# Parse small public JSON responses locally, without external dependencies.
field() {
  printf '%s' "$HTTP_BODY" | python3 -c '
import json,sys
v=json.load(sys.stdin).get(sys.argv[1])
print("true" if v is True else "false" if v is False else "" if v is None else v)
' "$1"
}

SUMMARY='Retry-safe anonymous integrity rehearsal'
rpc "$OPERATION" "$SUMMARY"
[[ "$HTTP_STATUS" == 2* ]] || fail "Initial anonymous report failed ($HTTP_STATUS): $HTTP_BODY"
FIRST_CODE="$(field case_code)"
FIRST_CASE_ID="$(field case_id)"
FIRST_RECOVERY="$(field recovery_key)"
[[ -n "$FIRST_CODE" && -n "$FIRST_CASE_ID" && -n "$FIRST_RECOVERY" ]] ||
  fail "Initial receipt did not contain canonical case and recovery identity"
[[ "$(field replayed)" == false ]] || fail "First case incorrectly marked a replay"

rpc "$OPERATION" "$SUMMARY"
[[ "$HTTP_STATUS" == 2* ]] || fail "Same-request retry failed ($HTTP_STATUS): $HTTP_BODY"
[[ "$(field replayed)" == true ]] || fail "Identical request did not replay"
[[ "$(field case_code)" == "$FIRST_CODE" ]] || fail "Retry allocated a second case"
[[ "$(field case_id)" == "$FIRST_CASE_ID" ]] || fail "Retry changed canonical case identity"
[[ "$(field recovery_key)" == "$FIRST_RECOVERY" ]] || fail "Retry did not recover same secret"

rpc "$OPERATION" "Changed integrity report while reusing its submission secret"
[[ "$HTTP_STATUS" != 2* && "$HTTP_BODY" == *IDEMPOTENCY_CONFLICT* ]] ||
  fail "Changed semantic request was accepted with the old idempotency secret"
rpc "$OTHER_OPERATION" "$SUMMARY"
[[ "$HTTP_STATUS" != 2* && "$HTTP_BODY" == *IDEMPOTENCY_CONFLICT* ]] ||
  fail "Different operation identity reused the same idempotency secret"

psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt \
  -v operation="$OPERATION" -v caseid="$FIRST_CASE_ID" <<'SQL'
do $assert$
declare
  v_ledger record;
begin
  select * into v_ledger
  from private.v3_anonymous_integrity_case_operations
  where operation_id='00000000-0000-4000-8000-00000000c161';
  if v_ledger.case_id is null or v_ledger.completed_at is null
     or v_ledger.recovery_secret_ciphertext is null
     or v_ledger.idempotency_key_hash = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' then
    raise exception 'ANONYMOUS_REPLAY_LEDGER_NOT_PRIVATE_OR_COMPLETE';
  end if;
  if (select count(*) from private.v3_anonymous_integrity_case_operations
      where operation_id='00000000-0000-4000-8000-00000000c161') <> 1 then
    raise exception 'DUPLICATE_REPLAY_LEDGER_IDENTITY';
  end if;
  if has_table_privilege('anon','private.v3_anonymous_integrity_case_operations','SELECT')
     or has_table_privilege('authenticated','private.v3_anonymous_integrity_case_operations','SELECT') then
    raise exception 'PRIVATE_REPLAY_LEDGER_PUBLICLY_READABLE';
  end if;
end
$assert$;
SQL
printf '%s\n' '[v3-integrity-idempotency] Isolated replay, conflict and private ledger checks passed'
