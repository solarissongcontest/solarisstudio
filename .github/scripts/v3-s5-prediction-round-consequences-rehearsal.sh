#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s5-prediction-round] %s\n' "$*"; }
fail() { printf '[v3-s5-prediction-round] ERROR: %s\n' "$*" >&2; exit 1; }

DB_URL="${SUPABASE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
case "$DB_URL" in
  postgresql://*@127.0.0.1:*/*|postgresql://*@localhost:*/*|postgres://*@127.0.0.1:*/*|postgres://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: SUPABASE_DB_URL must be loopback" ;;
esac

USER_ID='00000000-0000-4000-8000-00000000a961'
EDITION_ID='00000000-0000-4000-8000-00000000e961'
SHOW_ID='00000000-0000-4000-8000-00000000b961'
DELETE_SHOW_ID='00000000-0000-4000-8000-00000000b962'
OP_CREATE='00000000-0000-4000-8000-00000000c961'
OP_NOOP='00000000-0000-4000-8000-00000000c962'
OP_STALE='00000000-0000-4000-8000-00000000c963'
OP_PUBLISH='00000000-0000-4000-8000-00000000c964'
OP_LOCK='00000000-0000-4000-8000-00000000c965'
OP_SCORING='00000000-0000-4000-8000-00000000c966'
OP_DELETE_CREATE='00000000-0000-4000-8000-00000000c967'
OP_DELETE='00000000-0000-4000-8000-00000000c968'

db_exec() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
as_user_value() {
  local query="$1"
  psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query" | tail -n1 | tr -d '\r'
}
as_user_fails() {
  local query="$1"
  if psql "$DB_URL" -X -v ON_ERROR_STOP=1 -Atq -c "set role authenticated; set request.jwt.claim.sub='$USER_ID'; set request.jwt.claim.role='authenticated'; $query" >/dev/null 2>&1; then
    return 1
  fi
}

log "Seed isolated Prediction configuration authority"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s5-prediction-round@local.invalid',now(),now());
insert into public.editions(id,name,slug,edition_number,status,published)
values ('$EDITION_ID','S5 Prediction Round','s5-prediction-round',99611,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config,qualifier_count) values
  ('$SHOW_ID','$EDITION_ID','Prediction Round Final','final',1,false,'{}'::jsonb,null),
  ('$DELETE_SHOW_ID','$EDITION_ID','Prediction Delete Final','final',2,false,'{}'::jsonb,null);
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','voting.manage','$EDITION_ID')
on conflict do nothing;
"

OPEN_AT="$(db_value "select (clock_timestamp() - interval '5 minutes')::text;")"
LOCK_AT="$(db_value "select (clock_timestamp() + interval '2 hours')::text;")"
DELETE_OPEN_AT="$(db_value "select (clock_timestamp() + interval '1 hour')::text;")"
DELETE_LOCK_AT="$(db_value "select (clock_timestamp() + interval '3 hours')::text;")"

log "Config preview reports version zero before a round exists"
[[ "$(as_user_value "select public.studio2_prediction_round_config_preview('$SHOW_ID'::uuid)->>'roundVersion';")" == '0' ]] || fail "new round preview is not version zero"

log "Create draft through canonical operation boundary"
CREATE_RESULT="$(as_user_value "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'draft',array['top_three','winner']::text[],5,'$OP_CREATE'::uuid,'prediction-round-create',0)::text;")"
ROUND_ID="$(db_value "select id::text from public.prediction_rounds where show_id='$SHOW_ID'::uuid;")"
[[ -n "$ROUND_ID" ]] || fail "canonical create produced no Prediction round"
[[ "$(db_value "select version from public.studio2_prediction_round_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "created round revision is not 1"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_CREATE'::uuid and event_type='prediction.changed' and aggregate_version=1;")" == '1' ]] || fail "create did not emit revision-one prediction.changed"
[[ "$(db_value "select prediction_types::text from public.prediction_rounds where id='$ROUND_ID'::uuid;")" == '{top_three,winner}' ]] || fail "prediction types were not stored canonically"

log "Exact operation replay does not duplicate state or facts"
as_user_value "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'draft',array['winner','top_three']::text[],5,'$OP_CREATE'::uuid,'prediction-round-create',0)->>'roundVersion';" >/dev/null
[[ "$(db_value "select version from public.studio2_prediction_round_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "exact replay advanced round revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_CREATE'::uuid and event_type='prediction.changed';")" == '1' ]] || fail "exact replay duplicated prediction.changed"

log "A new operation with identical semantics becomes a no-op"
[[ "$(as_user_value "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'draft',array['winner','top_three']::text[],5,'$OP_NOOP'::uuid,'prediction-round-noop',1)->>'changed';")" == 'false' ]] || fail "identical save was not reported as no-op"
[[ "$(db_value "select version from public.studio2_prediction_round_versions where round_id='$ROUND_ID'::uuid;")" == '1' ]] || fail "semantic no-op advanced round revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_NOOP'::uuid;")" == '0' ]] || fail "semantic no-op emitted prediction.changed"

log "Stale optimistic version fails and rolls back its operation claim"
as_user_fails "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'open',array['winner','top_three']::text[],5,'$OP_STALE'::uuid,'prediction-round-stale',0);" || fail "stale round revision unexpectedly succeeded"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$OP_STALE'::uuid;")" == '0' ]] || fail "stale round operation claim escaped rollback"

log "Publishing advances semantic revision to two"
[[ "$(as_user_value "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'open',array['winner','top_three']::text[],5,'$OP_PUBLISH'::uuid,'prediction-round-publish',1)->>'roundVersion';")" == '2' ]] || fail "published round revision is not 2"
[[ "$(db_value "select command from public.studio2_operation_receipts where operation_id='$OP_PUBLISH'::uuid;")" == 'prediction.publish' ]] || fail "open transition did not use prediction.publish command"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_PUBLISH'::uuid and event_type='prediction.changed' and aggregate_version=2 and payload->>'action'='publish';")" == '1' ]] || fail "publish transition event missing"

log "Locking advances semantic revision to three"
[[ "$(as_user_value "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'locked',array['winner','top_three']::text[],5,'$OP_LOCK'::uuid,'prediction-round-lock',2)->>'roundVersion';")" == '3' ]] || fail "locked round revision is not 3"
[[ "$(db_value "select command from public.studio2_operation_receipts where operation_id='$OP_LOCK'::uuid;")" == 'prediction.lock' ]] || fail "lock transition did not use prediction.lock command"

log "Scoring state cannot be forged through configuration"
as_user_fails "select public.studio2_save_prediction_round('$SHOW_ID'::uuid,'$OPEN_AT'::timestamptz,'$LOCK_AT'::timestamptz,'scoring',array['winner']::text[],5,'$OP_SCORING'::uuid,'prediction-round-scoring',3);" || fail "configuration path accepted scorer-owned status"

log "Direct browser table writes are denied after RPC cutover"
as_user_fails "update public.prediction_rounds set consensus_minimum=6 where id='$ROUND_ID'::uuid;" || fail "direct prediction_rounds update remains browser-writable"

log "Create and delete a separate untouched draft through versioned commands"
[[ "$(as_user_value "select public.studio2_save_prediction_round('$DELETE_SHOW_ID'::uuid,'$DELETE_OPEN_AT'::timestamptz,'$DELETE_LOCK_AT'::timestamptz,'draft',array['winner']::text[],5,'$OP_DELETE_CREATE'::uuid,'prediction-delete-create',0)->>'roundVersion';")" == '1' ]] || fail "delete fixture did not start at version one"
DELETE_ROUND_ID="$(db_value "select id::text from public.prediction_rounds where show_id='$DELETE_SHOW_ID'::uuid;")"
[[ "$(as_user_value "select public.studio2_prediction_round_delete_preview('$DELETE_ROUND_ID'::uuid)->>'roundVersion';")" == '1' ]] || fail "delete preview version mismatch"
[[ "$(as_user_value "select public.studio2_delete_prediction_round('$DELETE_ROUND_ID'::uuid,'$OP_DELETE'::uuid,'prediction-round-delete',1)->>'roundVersion';")" == '2' ]] || fail "delete did not produce terminal revision two"
[[ "$(db_value "select count(*) from public.prediction_rounds where id='$DELETE_ROUND_ID'::uuid;")" == '0' ]] || fail "draft row survived canonical delete"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$OP_DELETE'::uuid and event_type='prediction.changed' and aggregate_version=2 and payload->>'action'='delete';")" == '1' ]] || fail "deleted round did not emit terminal prediction.changed"

log "No private user/profile identity is present in Prediction configuration event payloads"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='prediction_round' and event_type='prediction.changed' and (payload ? 'userId' or payload ? 'profileId' or payload ? 'actorId');")" == '0' ]] || fail "Prediction round event payload leaked user identity"

log "System V3 S5 Prediction round consequence rehearsal passed"
