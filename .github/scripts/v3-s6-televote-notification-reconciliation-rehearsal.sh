#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s6-televote-notification] %s\n' "$*"; }
fail() { printf '\n[v3-s6-televote-notification] FAIL: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
service_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "set \"request.jwt.claim.role\"='service_role'; $1"; }
assert_json() {
  local payload="$1" expression="$2"
  python3 - "$payload" "$expression" <<'PY'
import json,sys
p=json.loads(sys.argv[1])
expr=sys.argv[2]
if not eval(expr, {"__builtins__": {}}, {"p": p}):
    raise SystemExit(f"assertion failed: {expr}; payload={p}")
PY
}

USER_ID='00000000-0000-4000-8000-00000000b611'
EDITION_ID='00000000-0000-4000-8000-00000000b612'
ROUND_ID='00000000-0000-4000-8000-00000000b613'
PROVIDER='televote-open'
ORIGINAL_OPEN_ID="$(db_value "select id::text from televoting.rounds where status='open' order by id limit 1;")"

restore_original_open() {
  db_exec "update televoting.rounds set status='closed', closed_at=coalesce(closed_at,now()) where id='$ROUND_ID'::uuid and status='open';" || true
  if [[ -n "$ORIGINAL_OPEN_ID" && "$ORIGINAL_OPEN_ID" != "$ROUND_ID" ]]; then
    db_exec "update televoting.rounds set status='open', opened_at=coalesce(opened_at,now()), closed_at=null where id='$ORIGINAL_OPEN_ID'::uuid;" || true
  fi
}
trap restore_original_open EXIT

log "Seed one fan preference and one canonical open Televoting round"
if [[ -n "$ORIGINAL_OPEN_ID" && "$ORIGINAL_OPEN_ID" != "$ROUND_ID" ]]; then
  db_exec "update televoting.rounds set status='closed', closed_at=now() where id='$ORIGINAL_OPEN_ID'::uuid;"
fi

db_exec "
delete from public.notification_deliveries where user_id='$USER_ID'::uuid;
delete from public.notification_preferences where profile_id='$USER_ID'::uuid;
delete from public.fan_profiles where id='$USER_ID'::uuid;
delete from auth.users where id='$USER_ID'::uuid;
delete from televoting.rounds where id='$ROUND_ID'::uuid;
delete from televoting.editions where id='$EDITION_ID'::uuid;

insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s6-televote-notification@local.invalid',now(),now());
insert into public.fan_profiles(id,display_name)
values ('$USER_ID'::uuid,'S6 televote fixture');
insert into public.notification_preferences(profile_id,in_app_enabled,categories,external_enabled)
values ('$USER_ID'::uuid,true,array['televoting']::text[],true);
insert into televoting.editions(id,name,is_active,is_archived)
values ('$EDITION_ID'::uuid,'S6 notification rehearsal',false,false);
insert into televoting.rounds(id,edition_id,name,status,opened_at)
values ('$ROUND_ID'::uuid,'$EDITION_ID'::uuid,'S6 Televote Round','open',now());
"

BEFORE="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$BEFORE" "p['state'] == 'drift'"
assert_json "$BEFORE" "p['missing'] == 1"
log "PASS: verifier independently detects the missing televote-open delivery"

FIRST="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$FIRST" "p['inserted'] == 1"
assert_json "$FIRST" "p['state'] == 'consistent'"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='televote:$ROUND_ID:$USER_ID:opened';")" == '1' ]] || fail "stable televote dedupe identity was not created exactly once"
[[ "$(db_value "select event_type from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='televote:$ROUND_ID:$USER_ID:opened';")" == 'televote.opened' ]] || fail "televote event type drifted"

SECOND="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$SECOND" "p['changed'] == 0"
log "PASS: repeated actor/provider repair is idempotent"

log "Close canonical round and prove stale unsent delivery is suppressed"
db_exec "update televoting.rounds set status='closed',closed_at=now() where id='$ROUND_ID'::uuid;"
STALE="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$STALE" "p['state'] == 'drift'"
assert_json "$STALE" "p['staleActive'] == 1"
SUPPRESS="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$SUPPRESS" "p['suppressed'] == 1"
assert_json "$SUPPRESS" "p['state'] == 'consistent'"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='televote:$ROUND_ID:$USER_ID:opened';")" == 'suppressed' ]] || fail "closed-round delivery was not suppressed"

log "Re-open round and reactivate the same never-sent dedupe identity"
db_exec "update televoting.rounds set status='open',opened_at=now(),closed_at=null where id='$ROUND_ID'::uuid;"
REOPENED="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$REOPENED" "p['state'] == 'drift'"
assert_json "$REOPENED" "p['suppressedExpected'] == 1"
REACTIVATE="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$REACTIVATE" "p['reactivated'] == 1"
assert_json "$REACTIVATE" "p['state'] == 'consistent'"
[[ "$(db_value "select count(*) from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='televote:$ROUND_ID:$USER_ID:opened';")" == '1' ]] || fail "reopen duplicated the delivery identity"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$USER_ID'::uuid and dedupe_key='televote:$ROUND_ID:$USER_ID:opened';")" == 'pending' ]] || fail "reopened round did not reactivate pending delivery"

log "Disable canonical external preference and suppress the delivery again"
db_exec "update public.notification_preferences set external_enabled=false,updated_at=now() where profile_id='$USER_ID'::uuid;"
PREFERENCE_STALE="$(service_value "select public.studio2_verify_notification_provider('$USER_ID'::uuid,'$PROVIDER')::text;")"
assert_json "$PREFERENCE_STALE" "p['state'] == 'drift'"
assert_json "$PREFERENCE_STALE" "p['staleActive'] == 1"
PREFERENCE_REPAIR="$(service_value "select public.studio2_reconcile_notification_provider('$USER_ID'::uuid,'$PROVIDER',now())::text;")"
assert_json "$PREFERENCE_REPAIR" "p['suppressed'] == 1"
assert_json "$PREFERENCE_REPAIR" "p['state'] == 'consistent'"

log "System V3 S6 bounded televote-open notification reconciliation passed"
