#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s8-confirmation-limits] %s\n' "$*"; }
fail() { printf '\n[v3-s8-confirmation-limits] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

HTTP_STATUS=''
HTTP_BODY=''
request_rpc() {
  local function_name="$1" body="$2" output
  output="$(mktemp)"
  HTTP_STATUS="$(curl -sS -o "$output" -w '%{http_code}' -X POST "$API_URL/rest/v1/rpc/$function_name" \
    -H "apikey: $ANON_KEY" \
    -H "Authorization: Bearer $ANON_KEY" \
    -H "Content-Type: application/json" \
    --data "$body")"
  HTTP_BODY="$(cat "$output")"
  rm -f "$output"
}
expect_success() { local label="$1"; (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"; log "PASS: $label"; }
expect_failure() { local label="$1"; (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded with HTTP $HTTP_STATUS: $HTTP_BODY"; log "PASS: $label rejected with HTTP $HTTP_STATUS"; }
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
db_expect_failure() { local label="$1" query="$2"; if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then fail "$label unexpectedly succeeded"; fi; log "PASS: $label rejected"; }
assert_db_eq() { local label="$1" query="$2" expected="$3" actual; actual="$(db_scalar "$query")"; [[ "$actual" == "$expected" ]] || fail "$label expected '$expected', got '$actual'"; log "PASS: $label"; }

EDITION_ID='00000000-0000-4000-8000-00000000a801'
ROUND_ID='00000000-0000-4000-8000-00000000a802'
db_exec "insert into public.editions(id,name,slug,edition_number,status,published) values ('$EDITION_ID','S8 Resource Edition','s8-resource-edition',9801,'draft',false); insert into public.submission_rounds(id,edition_id,name,status,editing_enabled) values ('$ROUND_ID','$EDITION_ID','S8 Resource Round','open',true);"

SMALL_PAYLOAD="$(python3 - <<'PY'
import json
print(json.dumps({'field':'normal','nested':{'enabled':True}}, separators=(',',':')))
PY
)"
NEAR_PAYLOAD="$(python3 - <<'PY'
import json
print(json.dumps({'data':'x'*30000}, separators=(',',':')))
PY
)"
OVERSIZED_PAYLOAD="$(python3 - <<'PY'
import json
print(json.dumps({'data':'x'*33000}, separators=(',',':')))
PY
)"

make_body() {
  local session="$1" payload="$2" revision="$3"
  python3 - "$ROUND_ID" "$session" "$payload" "$revision" <<'PY'
import json,sys
print(json.dumps({
  '_round_id':sys.argv[1],
  '_browser_session_id':sys.argv[2],
  '_payload':json.loads(sys.argv[3]),
  '_expected_revision':int(sys.argv[4]),
  '_instagram_username':'resource-test',
  '_country':'S8 Test',
  '_ip':'127.0.0.1',
}, separators=(',',':')))
PY
}

log "Normal and near-ceiling V3 drafts remain compatible"
request_rpc v3_save_confirmation_draft "$(make_body v3-normal "$SMALL_PAYLOAD" 0)"
expect_success "normal V3 draft"
assert_db_eq "normal V3 draft persisted" "select payload->>'field' from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='v3-normal';" "normal"

request_rpc v3_save_confirmation_draft "$(make_body v3-near "$NEAR_PAYLOAD" 0)"
expect_success "30 KiB-class V3 draft remains within budget"
assert_db_eq "near-budget V3 draft remains below ceiling" "select (octet_length(payload::text) <= 32768)::text from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='v3-near';" "true"

log "Oversized V3 draft is rejected before replacing canonical draft"
request_rpc v3_save_confirmation_draft "$(make_body v3-normal "$OVERSIZED_PAYLOAD" 1)"
expect_failure "oversized V3 draft"
assert_db_eq "rejected V3 update preserves earlier payload" "select payload->>'field' from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='v3-normal';" "normal"
assert_db_eq "rejected V3 update preserves revision" "select v3_revision::text from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='v3-normal';" "1"

log "Legacy compatibility RPC receives the same budget"
LEGACY_BODY="$(python3 - "$ROUND_ID" "$OVERSIZED_PAYLOAD" <<'PY'
import json,sys
print(json.dumps({
 '_round_id':sys.argv[1], '_browser_session_id':'legacy-large', '_payload':json.loads(sys.argv[2]),
 '_instagram_username':'legacy-test', '_country':'S8 Test', '_ip':'127.0.0.1'
}, separators=(',',':')))
PY
)"
request_rpc public_save_draft "$LEGACY_BODY"
expect_failure "oversized legacy draft"
assert_db_eq "rejected legacy write creates no row" "select count(*) from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='legacy-large';" "0"

log "Table invariant protects direct/internal writers"
db_expect_failure "direct oversized draft insert" "insert into public.submission_drafts(round_id,browser_session_id,payload) values ('$ROUND_ID','direct-large',jsonb_build_object('data',repeat('x',33000)));"
assert_db_eq "direct hostile write leaves no row" "select count(*) from public.submission_drafts where round_id='$ROUND_ID' and browser_session_id='direct-large';" "0"

log "All Confirmation resource-limit checks passed"
