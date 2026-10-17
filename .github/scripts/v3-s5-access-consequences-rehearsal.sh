#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-access] %s\n' "$*"; }
fail() { printf '[v3-s5-access] ERROR: %s\n' "$*" >&2; exit 1; }

API_URL="${SUPABASE_URL:-http://127.0.0.1:54321}"
DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
ANON_KEY="${SUPABASE_ANON_KEY:-}"
SERVICE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_URL must be loopback" ;;
esac
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

if [[ -z "$ANON_KEY" || -z "$SERVICE_KEY" ]]; then
  if command -v supabase >/dev/null 2>&1; then
    STATUS_ENV="$(supabase status -o env 2>/dev/null || true)"
    if [[ -z "$ANON_KEY" ]]; then
      ANON_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^ANON_KEY="\(.*\)"$/\1/p' | head -n1)"
    fi
    if [[ -z "$SERVICE_KEY" ]]; then
      SERVICE_KEY="$(printf '%s\n' "$STATUS_ENV" | sed -n 's/^SERVICE_ROLE_KEY="\(.*\)"$/\1/p' | head -n1)"
    fi
  fi
fi
[[ -n "$ANON_KEY" ]] || fail "SUPABASE_ANON_KEY is required"
[[ -n "$SERVICE_KEY" ]] || fail "SUPABASE_SERVICE_ROLE_KEY is required"

REQUEST_BODY=""
REQUEST_CODE=""
request() {
  local method="$1" url="$2" bearer="$3" apikey="$4" data="${5:-}"
  local tmp
  tmp="$(mktemp)"
  if [[ -n "$data" ]]; then
    REQUEST_CODE="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $apikey" \
      -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json' \
      --data "$data")"
  else
    REQUEST_CODE="$(curl -sS -o "$tmp" -w '%{http_code}' -X "$method" "$url" \
      -H "apikey: $apikey" \
      -H "Authorization: Bearer $bearer" \
      -H 'Content-Type: application/json')"
  fi
  REQUEST_BODY="$(cat "$tmp")"
  rm -f "$tmp"
}

json_value() {
  local key="$1"
  python3 -c 'import json,sys; data=json.load(sys.stdin); value=data; [None for part in sys.argv[1].split(".") if not (value := value.get(part) if isinstance(value,dict) else None)]; print("" if value is None else (str(value).lower() if isinstance(value,bool) else value))' "$key"
}

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1" | head -n1 | tr -d '\r'; }
service_value() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt \
    -c "select set_config('request.jwt.claim.role','service_role',true); $1" \
    | tail -n1 | tr -d '\r'
}

create_user() {
  local id="$1" email="$2" password="$3"
  request POST "$API_URL/auth/v1/admin/users" "$SERVICE_KEY" "$SERVICE_KEY" \
    "{\"id\":\"$id\",\"email\":\"$email\",\"password\":\"$password\",\"email_confirm\":true}"
  [[ "$REQUEST_CODE" == "200" || "$REQUEST_CODE" == "201" ]] || fail "Could not create local user $email: HTTP $REQUEST_CODE $REQUEST_BODY"
}

sign_in() {
  local email="$1" password="$2"
  request POST "$API_URL/auth/v1/token?grant_type=password" "$ANON_KEY" "$ANON_KEY" \
    "{\"email\":\"$email\",\"password\":\"$password\"}"
  [[ "$REQUEST_CODE" == "200" ]] || fail "Could not sign in $email: HTTP $REQUEST_CODE $REQUEST_BODY"
  printf '%s' "$REQUEST_BODY" | json_value access_token
}

rpc() {
  local token="$1" name="$2" body="$3"
  request POST "$API_URL/rest/v1/rpc/$name" "$token" "$ANON_KEY" "$body"
  [[ "$REQUEST_CODE" == "200" ]] || fail "$name failed: HTTP $REQUEST_CODE $REQUEST_BODY"
}

EDITION_ID="80000000-0000-4000-8000-000000000501"
REQUESTER_ID="80000000-0000-4000-8000-000000000502"
APPROVER_ID="80000000-0000-4000-8000-000000000503"
TARGET_ID="80000000-0000-4000-8000-000000000504"
ROLE_OPERATION_ID="80000000-0000-4000-8000-000000000505"
GRANT_OPERATION_ID="80000000-0000-4000-8000-000000000506"
PASSWORD='Solaris-S5-Access!2026'

log "Creating isolated local identities and Permission Engine fixture"
create_user "$REQUESTER_ID" "s5-access-requester@example.test" "$PASSWORD"
create_user "$APPROVER_ID" "s5-access-approver@example.test" "$PASSWORD"
create_user "$TARGET_ID" "s5-access-target@example.test" "$PASSWORD"

db_exec "
insert into public.editions (id, name, slug, edition_number, status, published)
values ('$EDITION_ID'::uuid, 'S5 Access Rehearsal', 's5-access-rehearsal', 99501, 'draft', false)
on conflict (id) do nothing;
insert into public.studio2_role_assignments (user_id, role_key, edition_id)
values
  ('$REQUESTER_ID'::uuid, 'organizer', null),
  ('$APPROVER_ID'::uuid, 'organizer', null)
on conflict (user_id, role_key, edition_id) do nothing;
"

REQUESTER_TOKEN="$(sign_in 's5-access-requester@example.test' "$PASSWORD")"
APPROVER_TOKEN="$(sign_in 's5-access-approver@example.test' "$PASSWORD")"
[[ -n "$REQUESTER_TOKEN" && -n "$APPROVER_TOKEN" ]] || fail "Fresh local auth tokens were not issued"

log "Running a real R3 role-assignment operation through preview -> request -> second approval -> apply"
rpc "$REQUESTER_TOKEN" studio2_permission_change_preview \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"assign_role\",\"p_key\":\"viewer\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null}"
ROLE_EXPECTED_VERSION="$(printf '%s' "$REQUEST_BODY" | json_value expectedVersion)"
[[ "$ROLE_EXPECTED_VERSION" == "0" ]] || fail "Unexpected initial permission subject version: $ROLE_EXPECTED_VERSION"

rpc "$REQUESTER_TOKEN" studio2_request_permission_change_approval \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"assign_role\",\"p_key\":\"viewer\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null,\"p_operation_id\":\"$ROLE_OPERATION_ID\",\"p_idempotency_key\":\"s5-access-role-assign\",\"p_expected_version\":$ROLE_EXPECTED_VERSION}"
ROLE_APPROVAL_ID="$(printf '%s' "$REQUEST_BODY" | json_value id)"
[[ -n "$ROLE_APPROVAL_ID" ]] || fail "R3 role approval request was not created"

rpc "$APPROVER_TOKEN" studio2_approve_permission_change \
  "{\"p_request_id\":\"$ROLE_APPROVAL_ID\"}"
[[ "$(printf '%s' "$REQUEST_BODY" | json_value approvedBy)" == "$APPROVER_ID" ]] || fail "Second operator did not approve the R3 role operation"

rpc "$REQUESTER_TOKEN" studio2_apply_permission_change_r3 \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"assign_role\",\"p_key\":\"viewer\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null,\"p_operation_id\":\"$ROLE_OPERATION_ID\",\"p_idempotency_key\":\"s5-access-role-assign\",\"p_expected_version\":$ROLE_EXPECTED_VERSION,\"p_approval_request_id\":\"$ROLE_APPROVAL_ID\"}"
[[ "$(printf '%s' "$REQUEST_BODY" | json_value changed)" == "true" ]] || fail "R3 role operation did not change canonical access"

[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and event_type='membership.changed';")" == "1" ]] || fail "membership.changed event missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and event_type='permissions.changed';")" == "1" ]] || fail "permissions.changed event missing for role assignment"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and aggregate_version=1;")" == "2" ]] || fail "Role events are not bound to permission subject version 1"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and (payload ? 'email' or payload ? 'displayName' or payload ? 'targetUserId');")" == "0" ]] || fail "Access DomainEvent payload leaked identity/profile data"
[[ "$(db_value "select count(*) from public.studio2_permission_change_approval_requests where id='$ROLE_APPROVAL_ID'::uuid and consumed_at is not null;")" == "1" ]] || fail "R3 role approval was not consumed"

log "Running a direct capability grant; it must not fabricate membership state"
rpc "$REQUESTER_TOKEN" studio2_permission_change_preview \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"entry.edit\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null}"
GRANT_EXPECTED_VERSION="$(printf '%s' "$REQUEST_BODY" | json_value expectedVersion)"
[[ "$GRANT_EXPECTED_VERSION" == "1" ]] || fail "Direct grant preview did not observe role mutation version"

rpc "$REQUESTER_TOKEN" studio2_request_permission_change_approval \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"entry.edit\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null,\"p_operation_id\":\"$GRANT_OPERATION_ID\",\"p_idempotency_key\":\"s5-access-direct-grant\",\"p_expected_version\":$GRANT_EXPECTED_VERSION}"
GRANT_APPROVAL_ID="$(printf '%s' "$REQUEST_BODY" | json_value id)"
[[ -n "$GRANT_APPROVAL_ID" ]] || fail "R3 direct-grant approval request was not created"

rpc "$APPROVER_TOKEN" studio2_approve_permission_change \
  "{\"p_request_id\":\"$GRANT_APPROVAL_ID\"}"
rpc "$REQUESTER_TOKEN" studio2_apply_permission_change_r3 \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"entry.edit\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null,\"p_operation_id\":\"$GRANT_OPERATION_ID\",\"p_idempotency_key\":\"s5-access-direct-grant\",\"p_expected_version\":$GRANT_EXPECTED_VERSION,\"p_approval_request_id\":\"$GRANT_APPROVAL_ID\"}"

[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$GRANT_OPERATION_ID'::uuid and event_type='permissions.changed' and aggregate_version=2;")" == "1" ]] || fail "Direct grant permissions.changed event missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$GRANT_OPERATION_ID'::uuid and event_type='membership.changed';")" == "0" ]] || fail "direct grant fabricated membership.changed"

log "Exact R3 replay returns the prior result without duplicating canonical facts"
rpc "$REQUESTER_TOKEN" studio2_apply_permission_change_r3 \
  "{\"p_user_id\":\"$TARGET_ID\",\"p_change_kind\":\"grant_capability\",\"p_key\":\"entry.edit\",\"p_edition_id\":\"$EDITION_ID\",\"p_expires_at\":null,\"p_operation_id\":\"$GRANT_OPERATION_ID\",\"p_idempotency_key\":\"s5-access-direct-grant\",\"p_expected_version\":$GRANT_EXPECTED_VERSION,\"p_approval_request_id\":\"$GRANT_APPROVAL_ID\"}"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$GRANT_OPERATION_ID'::uuid;")" == "1" ]] || fail "Exact R3 replay duplicated access events"

ROLE_MEMBERSHIP_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and event_type='membership.changed';")"
ROLE_PERMISSION_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$ROLE_OPERATION_ID'::uuid and event_type='permissions.changed';")"
GRANT_PERMISSION_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$GRANT_OPERATION_ID'::uuid and event_type='permissions.changed';")"

log "Claiming and processing access consequences through the shared leased outbox"
service_value "select count(*)::text from public.studio2_claim_domain_event_deliveries('access.tasks','s5-access-worker',20,60);" >/dev/null
for EVENT_ID in "$ROLE_MEMBERSHIP_EVENT" "$ROLE_PERMISSION_EVENT" "$GRANT_PERMISSION_EVENT"; do
  service_value "select public.studio2_process_access_domain_event('$EVENT_ID'::uuid,'access.tasks','s5-access-worker')->>'eventType';" >/dev/null
done
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where consumer_key='access.tasks' and event_id in ('$ROLE_MEMBERSHIP_EVENT'::uuid,'$ROLE_PERMISSION_EVENT'::uuid,'$GRANT_PERMISSION_EVENT'::uuid);")" == "3" ]] || fail "Access task consequence receipts are incomplete"
[[ "$(service_value "select public.studio2_process_access_domain_event('$ROLE_MEMBERSHIP_EVENT'::uuid,'access.tasks','replay-worker')->>'replayed';")" == "true" ]] || fail "Access consequence replay was not idempotent"

log "Browser roles cannot execute the service-only access consequence processor"
request POST "$API_URL/rest/v1/rpc/studio2_process_access_domain_event" "$ANON_KEY" "$ANON_KEY" \
  "{\"p_event_id\":\"$ROLE_MEMBERSHIP_EVENT\",\"p_consumer_key\":\"access.tasks\",\"p_worker_id\":\"browser\"}"
[[ "$REQUEST_CODE" == "401" || "$REQUEST_CODE" == "403" || "$REQUEST_CODE" == "404" ]] || fail "Anonymous access consequence processor unexpectedly returned HTTP $REQUEST_CODE"

log "S5 membership/access consequence rehearsal passed"
