#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s5-feature-rollout] %s\n' "$*"; }
fail() { printf '\n[v3-s5-feature-rollout] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
actor_value() {
  local actor_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " | tail -n 1
}
actor_expect_failure() {
  local actor_id="$1" label="$2" sql="$3"
  if psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "
    begin;
    select set_config('request.jwt.claim.sub', '$actor_id', true);
    select set_config('request.jwt.claim.role', 'authenticated', true);
    $sql
    commit;
  " >/dev/null 2>&1; then
    fail "$label unexpectedly succeeded"
  fi
  log "PASS: $label rejected"
}

ACTOR_ID='00000000-0000-4000-8000-000000009971'
OTHER_ID='00000000-0000-4000-8000-000000009972'
APPLY_OPERATION_ID='00000000-0000-4000-8000-00000000b971'
STALE_OPERATION_ID='00000000-0000-4000-8000-00000000b972'
FLAG_KEY='edition_simulator'

log "Seeding isolated rollout actors and one global rollout.manage grant"
db_exec "
insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
(
  '$ACTOR_ID','authenticated','authenticated','v3-s5-rollout-actor@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
),
(
  '$OTHER_ID','authenticated','authenticated','v3-s5-rollout-other@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
)
on conflict (id) do nothing;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$ACTOR_ID','rollout.manage',null)
on conflict do nothing;

update public.studio2_feature_flags
set enabled=false,
    admins_only=false,
    user_ids='{}'::uuid[],
    edition_ids='{}'::uuid[],
    revision=1,
    updated_by=null
where key='$FLAG_KEY';
"

[[ "$(db_value "select revision || ':' || enabled::text from public.studio2_feature_flags where key='$FLAG_KEY';")" == '1:false' ]] || fail "rollout fixture did not start at revision 1 disabled"

log "Compatibility RPC delegates one semantic rollout change into S2 + S4"
COMPAT_REVISION="$(actor_value "$ACTOR_ID" "
select (public.studio2_set_feature_flag(
  '$FLAG_KEY',
  true,
  false,
  array['$OTHER_ID'::uuid,'$ACTOR_ID'::uuid,'$OTHER_ID'::uuid],
  '{}'::uuid[]
)).revision::text;
")"
[[ "$COMPAT_REVISION" == '2' ]] || fail "compatibility rollout change did not advance revision to 2"

NORMALIZED_USERS="$(db_value "select array_to_string(user_ids, ',') from public.studio2_feature_flags where key='$FLAG_KEY';")"
EXPECTED_USERS="$(printf '%s\n%s\n' "$ACTOR_ID" "$OTHER_ID" | sort | paste -sd, -)"
[[ "$NORMALIZED_USERS" == "$EXPECTED_USERS" ]] || fail "rollout user scope was not normalized as a set"

COMPAT_OPERATION_ID="$(db_value "select operation_id::text from public.studio2_operation_receipts where actor_id='$ACTOR_ID'::uuid and command='rollout.change' order by created_at desc limit 1;")"
[[ -n "$COMPAT_OPERATION_ID" ]] || fail "compatibility rollout change lacks operation receipt"
[[ "$(db_value "select risk_class || ':' || status from public.studio2_operation_receipts where operation_id='$COMPAT_OPERATION_ID'::uuid;")" == 'R1:succeeded' ]] || fail "compatibility rollout receipt is not succeeded R1"

COMPAT_EVENT_ID="$(db_value "select id::text from private.v3_domain_events where operation_id='$COMPAT_OPERATION_ID'::uuid and event_type='rollout.changed' and aggregate_type='feature_rollout' and aggregate_id='$FLAG_KEY';")"
[[ -n "$COMPAT_EVENT_ID" ]] || fail "compatibility rollout change did not emit rollout.changed"
[[ "$(db_value "select aggregate_version::text from private.v3_domain_events where id='$COMPAT_EVENT_ID'::uuid;")" == '2' ]] || fail "rollout event did not bind revision 2"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$COMPAT_EVENT_ID'::uuid;")" == '0' ]] || fail "rollout change fabricated background work"
EVENT_PAYLOAD="$(db_value "select payload::text from private.v3_domain_events where id='$COMPAT_EVENT_ID'::uuid;")"
[[ "$EVENT_PAYLOAD" != *"$ACTOR_ID"* && "$EVENT_PAYLOAD" != *"$OTHER_ID"* ]] || fail "rollout event leaked targeted user identifiers"
[[ "$EVENT_PAYLOAD" != *"userIds"* && "$EVENT_PAYLOAD" != *"editionIds"* ]] || fail "rollout event leaked target identity arrays"

log "Equivalent reordered scope is a true no-op"
RECEIPTS_BEFORE_NOOP="$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$ACTOR_ID'::uuid and command='rollout.change';")"
EVENTS_BEFORE_NOOP="$(db_value "select count(*) from private.v3_domain_events where event_type='rollout.changed' and aggregate_id='$FLAG_KEY';")"
actor_value "$ACTOR_ID" "
select (public.studio2_set_feature_flag(
  '$FLAG_KEY',
  true,
  false,
  array['$ACTOR_ID'::uuid,'$OTHER_ID'::uuid],
  '{}'::uuid[]
)).revision::text;
" >/dev/null
[[ "$(db_value "select revision::text from public.studio2_feature_flags where key='$FLAG_KEY';")" == '2' ]] || fail "semantic no-op advanced rollout revision"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$ACTOR_ID'::uuid and command='rollout.change';")" == "$RECEIPTS_BEFORE_NOOP" ]] || fail "semantic no-op fabricated an operation receipt"
[[ "$(db_value "select count(*) from private.v3_domain_events where event_type='rollout.changed' and aggregate_id='$FLAG_KEY';")" == "$EVENTS_BEFORE_NOOP" ]] || fail "semantic no-op fabricated rollout.changed"

log "Explicit canonical apply binds exact revision and replays by operation identity"
APPLY_RESULT="$(actor_value "$ACTOR_ID" "
select public.studio2_apply_feature_flag_change(
  '$FLAG_KEY',
  false,
  false,
  array['$ACTOR_ID'::uuid,'$OTHER_ID'::uuid],
  '{}'::uuid[],
  '$APPLY_OPERATION_ID'::uuid,
  's5-rollout-explicit',
  2,
  '$APPLY_OPERATION_ID'::uuid
)::text;
")"
[[ "$APPLY_RESULT" == *'"status": "succeeded"'* ]] || fail "explicit rollout apply did not succeed"
[[ "$(db_value "select revision || ':' || enabled::text from public.studio2_feature_flags where key='$FLAG_KEY';")" == '3:false' ]] || fail "explicit rollout apply did not advance revision 3"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$APPLY_OPERATION_ID'::uuid and event_type='rollout.changed' and aggregate_version=3;")" == '1' ]] || fail "explicit rollout apply lacks revision-3 event"

REPLAY_RESULT="$(actor_value "$ACTOR_ID" "
select public.studio2_apply_feature_flag_change(
  '$FLAG_KEY',false,false,
  array['$ACTOR_ID'::uuid,'$OTHER_ID'::uuid],
  '{}'::uuid[],
  '$APPLY_OPERATION_ID'::uuid,
  's5-rollout-explicit',
  2,
  '$APPLY_OPERATION_ID'::uuid
)::text;
")"
[[ "$REPLAY_RESULT" == *'"replayed": true'* ]] || fail "exact rollout operation did not replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$APPLY_OPERATION_ID'::uuid and event_type='rollout.changed';")" == '1' ]] || fail "rollout replay duplicated event"
[[ "$(db_value "select revision::text from public.studio2_feature_flags where key='$FLAG_KEY';")" == '3' ]] || fail "rollout replay advanced revision"

log "Stale revision and unauthorized actor fail closed"
actor_expect_failure "$ACTOR_ID" "stale rollout CAS" "
select public.studio2_apply_feature_flag_change(
  '$FLAG_KEY',true,false,'{}'::uuid[],'{}'::uuid[],
  '$STALE_OPERATION_ID'::uuid,'s5-rollout-stale',2,'$STALE_OPERATION_ID'::uuid
);
"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$STALE_OPERATION_ID'::uuid;")" == '0' ]] || fail "stale rollout conflict persisted a partial receipt"
actor_expect_failure "$OTHER_ID" "unauthorized rollout preview" "
select public.studio2_feature_flag_change_preview(
  '$FLAG_KEY',true,false,'{}'::uuid[],'{}'::uuid[]
);
"

log "Anonymous service-role writer paths are closed"
[[ "$(db_value "select has_function_privilege('service_role','public.studio2_set_feature_flag(text,boolean,boolean,uuid[],uuid[])','EXECUTE')::text;")" == 'f' ]] || fail "service_role still executes compatibility rollout writer"
[[ "$(db_value "select has_function_privilege('service_role','public.studio2_apply_feature_flag_change(text,boolean,boolean,uuid[],uuid[],uuid,text,bigint,uuid)','EXECUTE')::text;")" == 'f' ]] || fail "service_role still executes canonical rollout writer"
[[ "$(db_value "select has_table_privilege('service_role','public.studio2_feature_flags','UPDATE')::text;")" == 'f' ]] || fail "service_role still has direct rollout UPDATE authority"

log "System V3 S5 Feature Rollout authority/consequence rehearsal passed"
