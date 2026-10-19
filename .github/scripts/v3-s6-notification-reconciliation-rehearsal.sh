#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s6-notification-reconciliation] %s\n' "$*"; }
fail() { printf '\n[v3-s6-notification-reconciliation] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal: $API_URL" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_scalar() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }
service_scalar() { db_scalar "set role service_role; set request.jwt.claim.role = 'service_role'; $1"; }
db_expect_failure() {
  local label="$1" query="$2"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$query" >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

USER_A='00000000-0000-4000-8000-00000000a661'
USER_B='00000000-0000-4000-8000-00000000a662'
EVENT_ID='00000000-0000-4000-8000-00000000e661'
STALE_ID='00000000-0000-4000-8000-00000000d661'
ENTITY_ID='00000000-0000-4000-8000-00000000c661'

log "Seeding two isolated notification recipients and one due provider event"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at) values
  ('$USER_A','authenticated','authenticated','s6-notification-a@local.invalid',now(),now()),
  ('$USER_B','authenticated','authenticated','s6-notification-b@local.invalid',now(),now());
insert into public.fan_profiles(id,display_name) values
  ('$USER_A','S6 notification A'),
  ('$USER_B','S6 notification B');
insert into public.notification_preferences(profile_id,categories,external_enabled) values
  ('$USER_A',array['predictions']::text[],true),
  ('$USER_B',array['predictions']::text[],true);
insert into public.content_events(
  id,event_type,entity_type,entity_id,title,summary,route,importance,published_at
) values (
  '$EVENT_ID','prediction_opened','edition','$ENTITY_ID','S6 prediction opened','Scoped notification rehearsal','/predictions','normal',now()
);
insert into public.notification_deliveries(
  id,user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
  '$STALE_ID','$USER_A','organizer_tasks','organizer_task.high','00000000-0000-4000-8000-00000000ffff',
  's6-stale-organizer-task:$USER_A','/admin/tasks','Stale task','Must be suppressed',now(),'pending'
);
"

db_expect_failure "anonymous verifier" \
  "set role anon; select public.studio2_verify_notification_delivery_projection('$USER_A'::uuid,now(),500);"
db_expect_failure "authenticated repair" \
  "set role authenticated; set request.jwt.claim.sub = '$USER_A'; select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100);"

log "Independent verifier detects one missing candidate and one stale pending delivery"
BEFORE="$(service_scalar "select public.studio2_verify_notification_delivery_projection('$USER_A'::uuid,now(),500)::text;")"
python3 - "$BEFORE" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['state'] == 'drift', payload
assert payload['reason'] == 'verified', payload
assert payload['missingCurrent'] == 1, payload
assert payload['stalePending'] == 1, payload
assert payload['failedExpected'] == 0, payload
PY

log "Exact-recipient repair inserts only A and suppresses A's stale delivery"
REPAIR="$(service_scalar "select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100)::text;")"
python3 - "$REPAIR" "$USER_A" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['userId'] == sys.argv[2], payload
assert payload['scope'] == 'recipient', payload
assert payload['inserted'] == 1, payload
assert payload['reactivated'] == 0, payload
assert payload['suppressed'] == 1, payload
assert payload['verification']['state'] == 'consistent', payload
PY
[[ "$(db_scalar "select status from public.notification_deliveries where id='$STALE_ID'::uuid;")" == "suppressed" ]] || fail "stale pending delivery was not suppressed"
[[ "$(db_scalar "select count(*) from public.notification_deliveries where user_id='$USER_A'::uuid and event_type='prediction_opened';")" == "1" ]] || fail "recipient A did not receive expected candidate"
[[ "$(db_scalar "select count(*) from public.notification_deliveries where user_id='$USER_B'::uuid;")" == "0" ]] || fail "recipient-bounded repair fanned out to recipient B"
DELIVERY_A="$(db_scalar "select id from public.notification_deliveries where user_id='$USER_A'::uuid and event_type='prediction_opened';")"
[[ -n "$DELIVERY_A" ]] || fail "recipient A delivery identity missing"

log "Replay is idempotent"
REPLAY="$(service_scalar "select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100)::text;")"
python3 - "$REPLAY" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['inserted'] == 0, payload
assert payload['reactivated'] == 0, payload
assert payload['suppressed'] == 0, payload
assert payload['verification']['state'] == 'consistent', payload
PY

log "Preference opt-out suppresses an unsent expected delivery"
db_exec "update public.notification_preferences set external_enabled=false where profile_id='$USER_A'::uuid;"
OPTOUT="$(service_scalar "select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100)::text;")"
python3 - "$OPTOUT" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['inserted'] == 0, payload
assert payload['reactivated'] == 0, payload
assert payload['suppressed'] == 1, payload
assert payload['verification']['state'] == 'consistent', payload
PY
[[ "$(db_scalar "select status from public.notification_deliveries where id='$DELIVERY_A'::uuid;")" == "suppressed" ]] || fail "preference opt-out did not suppress delivery"

log "Restored eligibility is visible as drift until the same stable identity is reactivated"
db_exec "update public.notification_preferences set external_enabled=true where profile_id='$USER_A'::uuid;"
REENABLED_BEFORE="$(service_scalar "select public.studio2_verify_notification_delivery_projection('$USER_A'::uuid,now(),500)::text;")"
python3 - "$REENABLED_BEFORE" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['state'] == 'drift', payload
assert payload['missingCurrent'] == 0, payload
assert payload['suppressedExpected'] == 1, payload
assert payload['failedExpected'] == 0, payload
PY
REACTIVATED="$(service_scalar "select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100)::text;")"
python3 - "$REACTIVATED" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['inserted'] == 0, payload
assert payload['reactivated'] == 1, payload
assert payload['suppressed'] == 0, payload
assert payload['verification']['state'] == 'consistent', payload
PY
[[ "$(db_scalar "select id from public.notification_deliveries where user_id='$USER_A'::uuid and event_type='prediction_opened';")" == "$DELIVERY_A" ]] || fail "reactivation replaced the stable delivery identity"
[[ "$(db_scalar "select status from public.notification_deliveries where id='$DELIVERY_A'::uuid;")" == "pending" ]] || fail "restored expected delivery was not reactivated"

log "Failed expected delivery stays failed and is reported as drift for governed retry"
db_exec "update public.notification_deliveries set status='failed',error='injected provider failure' where id='$DELIVERY_A'::uuid;"
FAILED_BEFORE="$(service_scalar "select public.studio2_verify_notification_delivery_projection('$USER_A'::uuid,now(),500)::text;")"
python3 - "$FAILED_BEFORE" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['state'] == 'drift', payload
assert payload['failedExpected'] == 1, payload
PY
FAILED_REPAIR="$(service_scalar "select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100)::text;")"
python3 - "$FAILED_REPAIR" <<'PY'
import json,sys
payload=json.loads(sys.argv[1])
assert payload['inserted'] == 0, payload
assert payload['reactivated'] == 0, payload
assert payload['suppressed'] == 0, payload
assert payload['verification']['state'] == 'drift', payload
assert payload['verification']['failedExpected'] == 1, payload
PY
[[ "$(db_scalar "select status from public.notification_deliveries where id='$DELIVERY_A'::uuid;")" == "failed" ]] || fail "reconciliation auto-retried a failed delivery"

log "Ordinary global enqueue uses the same candidate engine and reaches B"
[[ "$(service_scalar "select public.solaris_enqueue_app_notifications(now());")" == "1" ]] || fail "global enqueue should insert exactly B's missing delivery"
[[ "$(db_scalar "select count(*) from public.notification_deliveries where user_id='$USER_B'::uuid and event_type='prediction_opened';")" == "1" ]] || fail "global enqueue did not reach recipient B"
[[ "$(db_scalar "select count(*) from public.notification_deliveries where user_id='$USER_A'::uuid and event_type='prediction_opened';")" == "1" ]] || fail "global enqueue duplicated recipient A"
[[ "$(db_scalar "select status from public.notification_deliveries where id='$DELIVERY_A'::uuid;")" == "failed" ]] || fail "global enqueue auto-retried failed recipient A"

log "Repair refuses a recipient workload above the 100-candidate ceiling"
db_exec "
insert into public.content_events(event_type,entity_type,entity_id,title,summary,route,importance,published_at)
select
  'prediction_opened',
  'edition',
  gen_random_uuid(),
  'S6 bound ' || series::text,
  'Bound rehearsal',
  '/predictions',
  'normal',
  now()
from generate_series(1,100) series;
"
db_expect_failure "recipient repair over 100 candidates" \
  "set role service_role; set request.jwt.claim.role = 'service_role'; select public.studio2_reconcile_notification_delivery_projection('$USER_A'::uuid,now(),100);"
[[ "$(db_scalar "select count(*) from public.notification_deliveries where user_id='$USER_A'::uuid and event_type='prediction_opened';")" == "1" ]] || fail "bounded refusal partially mutated recipient A"

log "System V3 S6 notification reconciliation rehearsal passed"
