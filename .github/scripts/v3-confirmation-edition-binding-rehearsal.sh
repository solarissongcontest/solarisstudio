#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-confirmation-edition-binding] %s\n' "$*"; }
fail() { printf '\n[v3-confirmation-edition-binding] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# This rehearsal intentionally mutates fixtures. It is permitted only against
# the disposable local Supabase stack. Never relax these guards or substitute a
# hosted project because local setup is inconvenient.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${ANON_KEY:?missing local Supabase ANON_KEY}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

PASSWORD='V3ConfirmationBinding2026!'
EDITION_A='00000000-0000-4000-8000-000000007201'
EDITION_B='00000000-0000-4000-8000-000000007202'
ROUND_A='00000000-0000-4000-8000-000000007211'
SUBMISSION_A='00000000-0000-4000-8000-000000007221'
RUN_ID="$(python3 -c 'import uuid; print(uuid.uuid4().hex[:12])')"
HTTP_STATUS=''
HTTP_BODY=''
LAST_USER_ID=''
LAST_TOKEN=''

uuid4() { python3 -c 'import uuid; print(uuid.uuid4())'; }

json_value() {
  local path="$1"
  python3 -c '
import json, sys
path = sys.argv[1].split(".") if sys.argv[1] else []
value = json.load(sys.stdin)
for key in path:
    if isinstance(value, list): value = value[int(key)]
    else: value = value[key]
if value is None: print("")
elif isinstance(value, bool): print("true" if value else "false")
elif isinstance(value, (dict, list)): print(json.dumps(value, separators=(",", ":"), sort_keys=True))
else: print(value)
' "$path"
}

request() {
  local method="$1" url="$2" bearer="$3" api_key="$4" data="${5-}"
  local output
  output="$(mktemp)"
  local args=(-sS -o "$output" -w '%{http_code}' -X "$method" "$url" -H "apikey: $api_key" -H "Authorization: Bearer $bearer" -H "Content-Type: application/json")
  [[ -n "$data" ]] && args+=(--data "$data")
  HTTP_STATUS="$(curl "${args[@]}")"
  HTTP_BODY="$(<"$output")"
  rm -f "$output"
}

expect_success() {
  local label="$1"
  (( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "$label returned HTTP $HTTP_STATUS: $HTTP_BODY"
  log "PASS: $label"
}

expect_failure() {
  local label="$1" expected="${2-}"
  (( HTTP_STATUS >= 400 )) || fail "$label unexpectedly succeeded with HTTP $HTTP_STATUS: $HTTP_BODY"
  if [[ -n "$expected" && "$HTTP_BODY" != *"$expected"* ]]; then
    fail "$label failed without '$expected': $HTTP_BODY"
  fi
  log "PASS: $label rejected with HTTP $HTTP_STATUS${expected:+ ($expected)}"
}

expect_json() {
  local label="$1" path="$2" expected="$3" actual
  actual="$(printf '%s' "$HTTP_BODY" | json_value "$path")"
  [[ "$actual" == "$expected" ]] || fail "$label expected $path=$expected, got '$actual' from $HTTP_BODY"
  log "PASS: $label"
}

assert_local_targets() {
  case "$API_URL" in http://127.0.0.1:*|http://localhost:*|http://\[::1\]:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
  case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*|postgresql://postgres:postgres@\[::1\]:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac
}

db_value() { assert_local_targets; psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }

create_user() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2],"email_confirm":True}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_ROLE_KEY" "$SERVICE_ROLE_KEY" "$body"
  expect_success "create auth user $email"
  LAST_USER_ID="$(printf '%s' "$HTTP_BODY" | json_value id)"
  [[ -n "$LAST_USER_ID" ]] || fail "auth admin response for $email had no id"
}

sign_in() {
  local email="$1" body
  body="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"password":sys.argv[2]}))' "$email" "$PASSWORD")"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" "$body"
  expect_success "sign in $email"
  LAST_TOKEN="$(printf '%s' "$HTTP_BODY" | json_value access_token)"
  [[ -n "$LAST_TOKEN" ]] || fail "sign-in response for $email had no token"
}

rpc() {
  local token="$1" name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$name" "$token" "$ANON_KEY" "$body"
}

preview() {
  local token="$1" edition_id="$2" kind="$3" enabled_json="$4"
  rpc "$token" studio2_confirmation_edition_binding_preview "{\"p_edition_id\":\"$edition_id\",\"p_change_kind\":\"$kind\",\"p_enabled\":$enabled_json}"
}

apply_change() {
  local token="$1" edition_id="$2" kind="$3" enabled_json="$4" operation_id="$5" key="$6" version="$7" correlation_id="$8"
  rpc "$token" studio2_apply_confirmation_edition_binding_change "{\"p_edition_id\":\"$edition_id\",\"p_change_kind\":\"$kind\",\"p_enabled\":$enabled_json,\"p_operation_id\":\"$operation_id\",\"p_idempotency_key\":\"$key\",\"p_expected_version\":$version,\"p_correlation_id\":\"$correlation_id\"}"
}

log "Creating isolated edition fixtures"
db_value "
  delete from public.editions where id in ('$EDITION_A'::uuid, '$EDITION_B'::uuid);
  insert into public.editions (id, name, slug, edition_number, status, editing_enabled, data_revision)
  values
    ('$EDITION_A', 'W7 Binding Fixture A', 'w7-binding-fixture-a', 9901, 'draft', true, 0),
    ('$EDITION_B', 'W7 Binding Fixture B', 'w7-binding-fixture-b', 9902, 'draft', true, 0);
" >/dev/null

log "Creating edition-scoped actors"
create_user "w7-binding-a-$RUN_ID@solaris.invalid"; USER_A_ID="$LAST_USER_ID"
create_user "w7-binding-b-$RUN_ID@solaris.invalid"; USER_B_ID="$LAST_USER_ID"
create_user "w7-binding-hod-$RUN_ID@solaris.invalid"; USER_HOD_ID="$LAST_USER_ID"

db_value "
  insert into public.studio2_role_assignments (user_id, role_key, edition_id)
  values
    ('$USER_A_ID', 'organizer', '$EDITION_A'),
    ('$USER_B_ID', 'organizer', '$EDITION_B'),
    ('$USER_HOD_ID', 'hod', '$EDITION_A')
  on conflict (user_id, role_key, edition_id) do nothing;
" >/dev/null

sign_in "w7-binding-a-$RUN_ID@solaris.invalid"; USER_A_TOKEN="$LAST_TOKEN"
sign_in "w7-binding-b-$RUN_ID@solaris.invalid"; USER_B_TOKEN="$LAST_TOKEN"
sign_in "w7-binding-hod-$RUN_ID@solaris.invalid"; USER_HOD_TOKEN="$LAST_TOKEN"

log "Rejecting wrong-edition and non-manager actors"
rpc "$USER_B_TOKEN" studio2_confirmation_edition_binding "{\"p_edition_id\":\"$EDITION_A\"}"
expect_failure "wrong-edition organizer read" "AUTHORIZATION"
rpc "$USER_HOD_TOKEN" studio2_confirmation_edition_binding "{\"p_edition_id\":\"$EDITION_A\"}"
expect_failure "delegation actor without delegation.manage" "AUTHORIZATION"
WRONG_OPERATION="$(uuid4)"; WRONG_CORRELATION="$(uuid4)"
apply_change "$USER_B_TOKEN" "$EDITION_A" bind null "$WRONG_OPERATION" "w7-wrong-$RUN_ID" 0 "$WRONG_CORRELATION"
expect_failure "wrong-edition organizer mutation" "AUTHORIZATION"

log "Rejecting direct authenticated Confirmation integration-link INSERT"
request POST "$API_URL/rest/v1/integration_links" "$USER_A_TOKEN" "$ANON_KEY" "{\"service\":\"confirmations\",\"entity_type\":\"edition\",\"solaris_id\":\"$EDITION_A\",\"remote_id\":\"$EDITION_A\",\"edition_id\":\"$EDITION_A\",\"sync_status\":\"linked\"}"
expect_failure "direct Confirmation binding insert"
[[ "$(db_value "select count(*) from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';")" == '0' ]] || fail "direct browser INSERT created a Confirmation binding"

BIND_OPERATION="$(uuid4)"; BIND_CORRELATION="$(uuid4)"; BIND_KEY="w7-bind-$RUN_ID"
UPDATE_OPERATION="$(uuid4)"; UPDATE_CORRELATION="$(uuid4)"; UPDATE_KEY="w7-update-$RUN_ID"
EDIT_CLOSE_OPERATION="$(uuid4)"; EDIT_CLOSE_CORRELATION="$(uuid4)"; EDIT_CLOSE_KEY="w7-edit-close-$RUN_ID"
EDIT_OPEN_OPERATION="$(uuid4)"; EDIT_OPEN_CORRELATION="$(uuid4)"; EDIT_OPEN_KEY="w7-edit-open-$RUN_ID"
REMOVE_OPERATION="$(uuid4)"; REMOVE_CORRELATION="$(uuid4)"; REMOVE_KEY="w7-remove-$RUN_ID"
STALE_OPERATION="$(uuid4)"; STALE_CORRELATION="$(uuid4)"; STALE_KEY="w7-stale-$RUN_ID"
REUSED_OPERATION="$(uuid4)"; REUSED_CORRELATION="$(uuid4)"

log "Creating the exact canonical binding"
preview "$USER_A_TOKEN" "$EDITION_A" bind null
expect_success "binding create preview"
expect_json "binding create preview state" bindingState missing
VERSION_0="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$BIND_OPERATION" "$BIND_KEY" "$VERSION_0" "$BIND_CORRELATION"
expect_success "binding create"
expect_json "binding create receipt" status succeeded
expect_json "binding create state" result.bindingState linked
VERSION_1="$(printf '%s' "$HTTP_BODY" | json_value result.version)"
[[ "$VERSION_1" -gt "$VERSION_0" ]] || fail "binding create did not advance the durable state version"

log "Replaying the same create request idempotently"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$BIND_OPERATION" "$BIND_KEY" "$VERSION_0" "$BIND_CORRELATION"
expect_success "binding create replay"
expect_json "binding replay status" status succeeded
expect_json "binding replay marker" replayed true

log "Rejecting an idempotency key reused for different semantics"
# S2 keys are actor+command scoped. Change the version within the SAME command.
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$REUSED_OPERATION" "$BIND_KEY" "$VERSION_1" "$REUSED_CORRELATION"
expect_failure "changed request with reused idempotency key" "IDEMPOTENCY_CONFLICT"
log "Rejecting a globally reused operation ID across commands"
apply_change "$USER_A_TOKEN" "$EDITION_A" remove null "$BIND_OPERATION" "$BIND_KEY" "$VERSION_1" "$BIND_CORRELATION"
expect_failure "operation ID reused across command namespaces" "IDEMPOTENCY_CONFLICT"

log "Replaying an exact semantic key through a replacement request ID"
ALIAS_OPERATION="$(uuid4)"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$ALIAS_OPERATION" "$BIND_KEY" "$VERSION_0" "$BIND_CORRELATION"
expect_success "binding idempotency alias replay"
expect_json "alias recovers original operation identity" operationId "$BIND_OPERATION"
expect_json "alias recovers original outcome" replayed true


log "Rejecting direct authenticated Confirmation integration-link UPDATE and DELETE"
request PATCH "$API_URL/rest/v1/integration_links?service=eq.confirmations&entity_type=eq.edition&solaris_id=eq.$EDITION_A" "$USER_A_TOKEN" "$ANON_KEY" '{"sync_status":"error"}'
(( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "direct Confirmation binding update returned unexpected HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(db_value "select sync_status from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';")" == 'linked' ]] || fail "direct browser UPDATE changed the Confirmation binding"
request DELETE "$API_URL/rest/v1/integration_links?service=eq.confirmations&entity_type=eq.edition&solaris_id=eq.$EDITION_A" "$USER_A_TOKEN" "$ANON_KEY"
(( HTTP_STATUS >= 200 && HTTP_STATUS < 300 )) || fail "direct Confirmation binding delete returned unexpected HTTP $HTTP_STATUS: $HTTP_BODY"
[[ "$(db_value "select count(*) from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';")" == '1' ]] || fail "direct browser DELETE removed the Confirmation binding"
log "PASS: direct Confirmation UPDATE/DELETE had zero write effect"

log "Repairing stale binding metadata through the governed update path"
db_value "
  update public.integration_links
  set sync_status='pending', metadata='{}'::jsonb, last_synced_at=null, updated_at=now()
  where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';
" >/dev/null
preview "$USER_A_TOKEN" "$EDITION_A" bind null
expect_success "stale binding update preview"
expect_json "stale binding detected" bindingState stale
UPDATE_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$UPDATE_OPERATION" "$UPDATE_KEY" "$UPDATE_VERSION" "$UPDATE_CORRELATION"
expect_success "stale binding update"
expect_json "stale binding repaired" result.bindingState linked
VERSION_2="$(printf '%s' "$HTTP_BODY" | json_value result.version)"
[[ "$VERSION_2" -gt "$VERSION_1" ]] || fail "binding repair did not advance the durable state version"

log "Rejecting a stale expected version"
apply_change "$USER_A_TOKEN" "$EDITION_A" editing false "$STALE_OPERATION" "$STALE_KEY" "$VERSION_1" "$STALE_CORRELATION"
expect_failure "stale expected version" "VERSION_CONFLICT"
[[ "$HTTP_STATUS" == "409" ]] || fail "stale version must return a deterministic HTTP 409, got $HTTP_STATUS"

log "Closing existing-response editing through the R2 path"
preview "$USER_A_TOKEN" "$EDITION_A" editing false
expect_success "editing close preview"
expect_json "editing close preview current state" editingEnabled true
EDIT_CLOSE_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" editing false "$EDIT_CLOSE_OPERATION" "$EDIT_CLOSE_KEY" "$EDIT_CLOSE_VERSION" "$EDIT_CLOSE_CORRELATION"
expect_success "editing close"
expect_json "editing close receipt" status succeeded
expect_json "editing close result" result.editingEnabled false
VERSION_3="$(printf '%s' "$HTTP_BODY" | json_value result.version)"
[[ "$VERSION_3" -gt "$VERSION_2" ]] || fail "editing close did not advance the durable state version"

log "Reauthenticating immediately before the R3 editing expansion"
sign_in "w7-binding-a-$RUN_ID@solaris.invalid"; USER_A_TOKEN="$LAST_TOKEN"
preview "$USER_A_TOKEN" "$EDITION_A" editing true
expect_success "editing reopen preview"
expect_json "editing reopen preview risk" riskClass R3
EDIT_OPEN_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" editing true "$EDIT_OPEN_OPERATION" "$EDIT_OPEN_KEY" "$EDIT_OPEN_VERSION" "$EDIT_OPEN_CORRELATION"
expect_success "editing reopen"
expect_json "editing reopen receipt" status succeeded
expect_json "editing reopen result" result.editingEnabled true
VERSION_4="$(printf '%s' "$HTTP_BODY" | json_value result.version)"
[[ "$VERSION_4" -gt "$VERSION_3" ]] || fail "editing reopen did not advance the durable state version"
[[ "$(db_value "select case when actor_session_id is not null and coalesce((auth_freshness_evidence->>'fresh')::boolean,false) then 1 else 0 end from public.studio2_operation_receipts where operation_id='$EDIT_OPEN_OPERATION';")" == '1' ]] || fail "R3 editing reopen receipt lacks fresh-auth/session evidence"
log "PASS: R3 editing reopen stored fresh-auth evidence"

log "Creating historical Confirmation data that binding removal must preserve"
db_value "
  insert into public.submission_rounds (id, edition_id, name, status, editing_enabled)
  values ('$ROUND_A', '$EDITION_A', 'W7 historical round', 'draft', true);

  insert into public.submissions (
    id, edition_id, round_id, instagram_username, country, recovery_code
  ) values (
    '$SUBMISSION_A', '$EDITION_A', '$ROUND_A', 'w7_fixture', 'W7 Fixtureland', upper('W7R-$RUN_ID')
  );
" >/dev/null

log "Reading canonical state and reconciling the durable receipt"
rpc "$USER_A_TOKEN" studio2_confirmation_edition_binding "{\"p_edition_id\":\"$EDITION_A\"}"
expect_success "canonical binding readback"
expect_json "canonical readback binding" bindingState linked
expect_json "canonical readback editing" editingEnabled true
expect_json "canonical readback version" version "$VERSION_4"
expect_json "canonical readback round count" roundCount 1
expect_json "canonical readback response count" responseCount 1
rpc "$USER_A_TOKEN" studio2_reconcile_operation "{\"p_operation_id\":\"$EDIT_OPEN_OPERATION\"}"
expect_success "operation receipt reconciliation"
expect_json "reconciled operation status" status succeeded
expect_json "reconciled operation edition" result.editionId "$EDITION_A"

log "Reauthenticating immediately before R3 binding removal"
sign_in "w7-binding-a-$RUN_ID@solaris.invalid"; USER_A_TOKEN="$LAST_TOKEN"
preview "$USER_A_TOKEN" "$EDITION_A" remove null
expect_success "binding remove preview"
expect_json "binding remove preview risk" riskClass R3
expect_json "binding remove preview round count" roundCount 1
expect_json "binding remove preview response count" responseCount 1
REMOVE_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" remove null "$REMOVE_OPERATION" "$REMOVE_KEY" "$REMOVE_VERSION" "$REMOVE_CORRELATION"
expect_success "binding remove"
expect_json "binding remove receipt" status succeeded
expect_json "binding remove state" result.bindingState missing
VERSION_5="$(printf '%s' "$HTTP_BODY" | json_value result.version)"
[[ "$VERSION_5" -gt "$VERSION_4" ]] || fail "binding removal did not advance the durable state version"
[[ "$(db_value "select case when actor_session_id is not null and coalesce((auth_freshness_evidence->>'fresh')::boolean,false) then 1 else 0 end from public.studio2_operation_receipts where operation_id='$REMOVE_OPERATION';")" == '1' ]] || fail "R3 binding removal receipt lacks fresh-auth/session evidence"
[[ "$(db_value "select count(*) from public.submission_rounds where id='$ROUND_A' and edition_id='$EDITION_A';")" == '1' ]] || fail "binding removal deleted historical submission round"
[[ "$(db_value "select count(*) from public.submissions where id='$SUBMISSION_A' and edition_id='$EDITION_A';")" == '1' ]] || fail "binding removal deleted historical submission"
[[ "$(db_value "select count(*) from public.editions where id='$EDITION_A';")" == '1' ]] || fail "binding removal deleted canonical edition"
log "PASS: R3 removal preserved edition/round/response history"

log "Replaying the successful R3 remove after current state changed"
apply_change "$USER_A_TOKEN" "$EDITION_A" remove null "$REMOVE_OPERATION" "$REMOVE_KEY" "$REMOVE_VERSION" "$REMOVE_CORRELATION"
expect_success "binding remove replay"
expect_json "binding remove replay status" status succeeded
expect_json "binding remove replay marker" replayed true

log "Rejecting an ABA stale create after removal"
ABA_OPERATION="$(uuid4)"; ABA_CORRELATION="$(uuid4)"; ABA_KEY="w7-aba-$RUN_ID"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$ABA_OPERATION" "$ABA_KEY" "$VERSION_2" "$ABA_CORRELATION"
expect_failure "ABA stale create" "VERSION_CONFLICT"

log "Failing closed on a conflicting forward identity"
db_value "
  insert into public.integration_links (
    service, entity_type, solaris_id, remote_id, edition_id, sync_status, metadata, last_synced_at, updated_at
  ) values (
    'confirmations', 'edition', '$EDITION_A', '$EDITION_B', '$EDITION_A', 'linked', '{}'::jsonb, now(), now()
  );
" >/dev/null
rpc "$USER_A_TOKEN" studio2_confirmation_edition_binding "{\"p_edition_id\":\"$EDITION_A\"}"
expect_success "forward-conflicting binding readback"
expect_json "forward conflict surfaced" bindingState conflict
FORWARD_CONFLICT_OPERATION="$(uuid4)"; FORWARD_CONFLICT_CORRELATION="$(uuid4)"; FORWARD_CONFLICT_KEY="w7-forward-conflict-$RUN_ID"
preview "$USER_A_TOKEN" "$EDITION_A" bind null
expect_success "forward-conflicting binding preview"
FORWARD_CONFLICT_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$FORWARD_CONFLICT_OPERATION" "$FORWARD_CONFLICT_KEY" "$FORWARD_CONFLICT_VERSION" "$FORWARD_CONFLICT_CORRELATION"
expect_failure "forward conflicting binding apply" "BINDING_CONFLICT"
[[ "$(db_value "select remote_id from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';")" == "$EDITION_B" ]] || fail "forward conflict was silently rebound"
db_value "delete from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_A';" >/dev/null

log "Failing closed on a conflicting reverse identity"
db_value "
  insert into public.integration_links (
    service, entity_type, solaris_id, remote_id, edition_id, sync_status, metadata, last_synced_at, updated_at
  ) values (
    'confirmations', 'edition', '$EDITION_B', '$EDITION_A', '$EDITION_B', 'linked', '{}'::jsonb, now(), now()
  );
" >/dev/null
rpc "$USER_A_TOKEN" studio2_confirmation_edition_binding "{\"p_edition_id\":\"$EDITION_A\"}"
expect_success "reverse-conflicting binding readback"
expect_json "reverse conflict surfaced" bindingState conflict
REVERSE_CONFLICT_OPERATION="$(uuid4)"; REVERSE_CONFLICT_CORRELATION="$(uuid4)"; REVERSE_CONFLICT_KEY="w7-reverse-conflict-$RUN_ID"
preview "$USER_A_TOKEN" "$EDITION_A" bind null
expect_success "reverse-conflicting binding preview"
REVERSE_CONFLICT_VERSION="$(printf '%s' "$HTTP_BODY" | json_value expectedVersion)"
apply_change "$USER_A_TOKEN" "$EDITION_A" bind null "$REVERSE_CONFLICT_OPERATION" "$REVERSE_CONFLICT_KEY" "$REVERSE_CONFLICT_VERSION" "$REVERSE_CONFLICT_CORRELATION"
expect_failure "reverse conflicting binding apply" "BINDING_CONFLICT"
[[ "$(db_value "select solaris_id::text from public.integration_links where service='confirmations' and entity_type='edition' and remote_id='$EDITION_A';")" == "$EDITION_B" ]] || fail "reverse conflict was silently rebound"
db_value "delete from public.integration_links where service='confirmations' and entity_type='edition' and solaris_id='$EDITION_B';" >/dev/null

log "Verifying successful mutations emitted transactional DomainEvent/outbox evidence"
EVENT_COUNT="$(db_value "
  select count(*)
  from private.v3_domain_events event
  where event.operation_id in (
    '$BIND_OPERATION'::uuid,
    '$UPDATE_OPERATION'::uuid,
    '$EDIT_CLOSE_OPERATION'::uuid,
    '$EDIT_OPEN_OPERATION'::uuid,
    '$REMOVE_OPERATION'::uuid
  )
    and event.event_type='confirmation.window_changed'
    and event.aggregate_type='confirmation_edition'
    and event.edition_id='$EDITION_A'::uuid;
")"
[[ "$EVENT_COUNT" == '5' ]] || fail "expected 5 Confirmation edition DomainEvents, found $EVENT_COUNT"
OUTBOX_COUNT="$(db_value "
  select count(*)
  from private.v3_domain_event_outbox delivery
  join private.v3_domain_events event on event.id=delivery.event_id
  where event.operation_id in (
    '$BIND_OPERATION'::uuid,
    '$UPDATE_OPERATION'::uuid,
    '$EDIT_CLOSE_OPERATION'::uuid,
    '$EDIT_OPEN_OPERATION'::uuid,
    '$REMOVE_OPERATION'::uuid
  )
    and delivery.consumer_key in ('confirmation.tasks','confirmation.notifications');
")"
[[ "$OUTBOX_COUNT" == '10' ]] || fail "expected 10 Confirmation edition outbox deliveries, found $OUTBOX_COUNT"
log "PASS: DomainEvent and outbox evidence"

log "Confirmation edition binding rehearsal passed"
