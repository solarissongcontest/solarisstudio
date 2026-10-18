#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s11-consumer-edge] %s\n' "$*"; }
fail() { printf '\n[v3-s11-consumer-edge] FAIL: %s\n' "$*" >&2; exit 1; }

command -v supabase >/dev/null 2>&1 || fail "Supabase CLI is required"
command -v psql >/dev/null 2>&1 || fail "psql is required"
command -v curl >/dev/null 2>&1 || fail "curl is required"
command -v python3 >/dev/null 2>&1 || fail "python3 is required"

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
: "${SERVICE_ROLE_KEY:?missing local Supabase SERVICE_ROLE_KEY}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing hosted/non-local database rehearsal ($DB_URL)" ;;
esac

PREEXISTING="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  select count(*)
  from private.v3_domain_event_outbox delivery
  where delivery.consumer_key='jury.tasks'
    and delivery.status in ('pending','processing')
    and not exists (
      select 1 from private.v3_domain_event_consumer_receipts receipt
      where receipt.event_id=delivery.event_id
        and receipt.consumer_key=delivery.consumer_key
    );
")"
[[ "$PREEXISTING" == '0' ]] || fail "local database already has $PREEXISTING unconsumed jury.tasks deliveries; reset it before this rehearsal"

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select to_regprocedure('private.studio2_reconcile_all_organizer_tasks_v3_s11_unavailable(uuid)') is null;")" == 't' ]] \
  || fail "synthetic dependency-unavailable alias already exists; reset local database"

read -r EDITION_ID SHOW_ID < <(
  python3 - <<'PY'
import uuid
print(uuid.uuid4(), uuid.uuid4())
PY
)
EDITION_NUMBER="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select coalesce(max(edition_number),0) + 100002 from public.editions;")"
EDITION_SLUG="s11-consumer-edge-${EDITION_ID%%-*}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
insert into public.editions (id, name, edition_number, status, slug, published)
values (
  '$EDITION_ID'::uuid,
  'S11 consumer edge rehearsal',
  $EDITION_NUMBER,
  'draft',
  '$EDITION_SLUG',
  false
);
insert into public.shows (id, edition_id, name, kind, sort_order, published)
values (
  '$SHOW_ID'::uuid,
  '$EDITION_ID'::uuid,
  'S11 consumer edge show',
  'semi-final',
  1,
  false
);
SQL

create_close_event() {
  local expected_version="$1"
  local operation_id
  operation_id="$(python3 - <<'PY'
import uuid
print(uuid.uuid4())
PY
)"
  local idempotency_key="v3-s11-consumer-edge-$operation_id"
  local body_file="$TMP_DIR/create-$expected_version.json"
  local request_body
  request_body="$(python3 - <<PY
import json
print(json.dumps({
  "p_show_id": "$SHOW_ID",
  "p_status": "closed",
  "p_operation_id": "$operation_id",
  "p_idempotency_key": "$idempotency_key",
  "p_expected_version": $expected_version,
}, separators=(",", ":")))
PY
)"
  local status
  status="$(curl -sS -o "$body_file" -w '%{http_code}' \
    -X POST "$API_URL/rest/v1/rpc/studio2_apply_jury_voting_status" \
    -H "apikey: $SERVICE_ROLE_KEY" \
    -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
    -H 'Content-Type: application/json' \
    --data "$request_body")"
  [[ "$status" == '200' ]] || fail "jury close version $expected_version returned HTTP $status: $(cat "$body_file")"

  local event_id
  event_id="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    select id::text
    from private.v3_domain_events
    where operation_id='$operation_id'::uuid
      and event_type='jury.closed';
  ")"
  [[ -n "$event_id" ]] || fail "jury close version $expected_version emitted no jury.closed event"
  printf '%s' "$event_id"
}

claim_exact_fixture_event() {
  local worker="$1"
  local expected_event="$2"
  local claimed
  claimed="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -F '|' -c "
    set \"request.jwt.claim.role\"='service_role';
    select event_id::text, edition_id::text
    from public.studio2_claim_domain_event_deliveries('jury.tasks','$worker',1,60);
  ")"
  local event_id claimed_edition
  IFS='|' read -r event_id claimed_edition <<< "$claimed"
  [[ "$event_id" == "$expected_event" ]] || fail "expected to claim $expected_event but claimed ${event_id:-nothing}"
  [[ "$claimed_edition" == "$EDITION_ID" ]] || fail "claimed event escaped fixture edition"
}

process_event() {
  local worker="$1"
  local event_id="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    set \"request.jwt.claim.role\"='service_role';
    select public.studio2_process_jury_domain_event('$event_id'::uuid,'jury.tasks','$worker');
  "
}

task_fingerprint() {
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    select md5(coalesce(
      jsonb_agg(to_jsonb(task) order by task.source_key)::text,
      '[]'
    ))
    from public.studio2_organizer_tasks task
    where task.edition_id='$EDITION_ID'::uuid;
  "
}

log "Injecting a real duplicate consumer delivery"
DUP_EVENT="$(create_close_event 0)"
claim_exact_fixture_event 'v3-s11-duplicate-first' "$DUP_EVENT"
FIRST_RESULT="$(process_event 'v3-s11-duplicate-first' "$DUP_EVENT")"
[[ "$(python3 -c 'import json,sys; print(str(json.loads(sys.stdin.read()).get("replayed")).lower())' <<< "$FIRST_RESULT")" == 'false' ]] \
  || fail "first Jury consumer invocation was unexpectedly reported as replay"

TASKS_AFTER_FIRST="$(task_fingerprint)"
RECEIPTS_AFTER_FIRST="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$DUP_EVENT'::uuid and consumer_key='jury.tasks';")"
[[ "$RECEIPTS_AFTER_FIRST" == '1' ]] || fail "first consumer invocation did not create exactly one immutable receipt"

# This is the same event delivered to the same consumer function a second time.
# The receipt check intentionally happens before lease validation, so the second
# invocation must return replay without executing reconciliation again.
SECOND_RESULT="$(process_event 'v3-s11-duplicate-second' "$DUP_EVENT")"
[[ "$(python3 -c 'import json,sys; print(str(json.loads(sys.stdin.read()).get("replayed")).lower())' <<< "$SECOND_RESULT")" == 'true' ]] \
  || fail "duplicate Jury consumer delivery did not converge through replay"
TASKS_AFTER_SECOND="$(task_fingerprint)"
[[ "$TASKS_AFTER_SECOND" == "$TASKS_AFTER_FIRST" ]] || fail "duplicate delivery changed Organizer Task consequence state"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$DUP_EVENT'::uuid and consumer_key='jury.tasks';")" == '1' ]] \
  || fail "duplicate delivery created more than one immutable consumer receipt"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select attempt_count from private.v3_domain_event_outbox where event_id='$DUP_EVENT'::uuid and consumer_key='jury.tasks';")" == '1' ]] \
  || fail "duplicate consumer invocation fabricated an additional queue claim"

log "Injecting a genuinely unavailable consumer dependency"
DEP_EVENT="$(create_close_event 1)"
claim_exact_fixture_event 'v3-s11-dependency-first' "$DEP_EVENT"

# Rename the real dependency only inside one local transaction. The consumer call
# runs in a PL/pgSQL exception subtransaction so its partial work rolls back, then
# the canonical function name is restored before commit.
psql "$DB_URL" -v ON_ERROR_STOP=1 -q <<SQL
begin;
alter function private.studio2_reconcile_all_organizer_tasks(uuid)
  rename to studio2_reconcile_all_organizer_tasks_v3_s11_unavailable;

do \$dependency_failure\$
declare
  v_failed boolean := false;
begin
  begin
    perform set_config('request.jwt.claim.role','service_role',true);
    perform public.studio2_process_jury_domain_event(
      '$DEP_EVENT'::uuid,
      'jury.tasks',
      'v3-s11-dependency-first'
    );
  exception when undefined_function then
    v_failed := true;
  end;
  if not v_failed then
    raise exception 'Synthetic dependency outage did not reach Jury consumer';
  end if;
end
\$dependency_failure\$;

alter function private.studio2_reconcile_all_organizer_tasks_v3_s11_unavailable(uuid)
  rename to studio2_reconcile_all_organizer_tasks;
commit;
SQL

[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select to_regprocedure('private.studio2_reconcile_all_organizer_tasks(uuid)') is not null;")" == 't' ]] \
  || fail "canonical Jury task reconciliation dependency was not restored"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select to_regprocedure('private.studio2_reconcile_all_organizer_tasks_v3_s11_unavailable(uuid)') is null;")" == 't' ]] \
  || fail "synthetic unavailable dependency alias remained after injection"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$DEP_EVENT'::uuid and consumer_key='jury.tasks';")" == '0' ]] \
  || fail "failed dependency call unexpectedly committed a consumer receipt"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select status || '|' || lease_owner from private.v3_domain_event_outbox where event_id='$DEP_EVENT'::uuid and consumer_key='jury.tasks';")" == 'processing|v3-s11-dependency-first' ]] \
  || fail "dependency failure did not leave the claimed delivery owned for canonical failure recording"

FAIL_RESULT="$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
  set \"request.jwt.claim.role\"='service_role';
  select public.studio2_fail_domain_event_delivery(
    '$DEP_EVENT'::uuid,
    'jury.tasks',
    'v3-s11-dependency-first',
    'DEPENDENCY_FAILURE',
    jsonb_build_object('dependency','private.studio2_reconcile_all_organizer_tasks','synthetic',true),
    0,
    8
  );
")"
[[ "$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("status"))' <<< "$FAIL_RESULT")" == 'pending' ]] \
  || fail "canonical dependency failure did not schedule a retry"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select last_error_code from private.v3_domain_event_outbox where event_id='$DEP_EVENT'::uuid and consumer_key='jury.tasks';")" == 'DEPENDENCY_FAILURE' ]] \
  || fail "canonical delivery did not retain DEPENDENCY_FAILURE evidence"

claim_exact_fixture_event 'v3-s11-dependency-retry' "$DEP_EVENT"
RETRY_RESULT="$(process_event 'v3-s11-dependency-retry' "$DEP_EVENT")"
[[ "$(python3 -c 'import json,sys; print(str(json.loads(sys.stdin.read()).get("replayed")).lower())' <<< "$RETRY_RESULT")" == 'false' ]] \
  || fail "dependency recovery unexpectedly replayed a pre-existing consumer receipt"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select status || '|' || attempt_count from private.v3_domain_event_outbox where event_id='$DEP_EVENT'::uuid and consumer_key='jury.tasks';")" == 'completed|2' ]] \
  || fail "dependency recovery did not complete on the second bounded attempt"
[[ "$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$DEP_EVENT'::uuid and consumer_key='jury.tasks';")" == '1' ]] \
  || fail "dependency recovery did not converge on exactly one immutable consumer receipt"

log "PASS: duplicate consumer delivery replayed without duplicate consequences and a real unavailable dependency recovered through canonical S4 retry"
log "Fixture ledger rows are intentionally left in this disposable local database; reset local Supabase after retaining evidence."
