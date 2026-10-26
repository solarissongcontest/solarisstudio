#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s15-incident] %s\n' "$*"; }
fail() { printf '[v3-s15-incident] ERROR: %s\n' "$*" >&2; exit 1; }

eval "$(supabase status -o env 2>/dev/null || true)"
API_URL="${API_URL:-${SUPABASE_URL:-}}"
DB_URL="${DB_URL:-${SUPABASE_DB_URL:-}}"
SERVICE_ROLE_KEY="${SERVICE_ROLE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*|https://127.0.0.1:*|https://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal: API_URL must be loopback" ;;
esac
case "$DB_URL" in
  postgres://*@127.0.0.1:*/*|postgresql://*@127.0.0.1:*/*|postgres://*@localhost:*/*|postgresql://*@localhost:*/*) ;;
  *) fail "Refusing hosted Supabase rehearsal: DB_URL must be loopback" ;;
esac
[[ -n "$SERVICE_ROLE_KEY" ]] || fail "local SERVICE_ROLE_KEY is required"

export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local

if [[ -f scripts/check-v3-production-isolation.ts ]]; then
  bun run scripts/check-v3-production-isolation.ts
fi

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1" | tail -n1 | tr -d '\r'; }
as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq <<SQL | tail -n1 | tr -d '\r'
set role authenticated;
select set_config(
  'request.jwt.claims',
  jsonb_build_object(
    'sub', '$user_id',
    'role', 'authenticated',
    'auth_time', extract(epoch from now())::bigint,
    'aal', 'aal2'
  )::text,
  false
);
$sql
SQL
}

ACTOR_ID='26202600-0000-4000-8000-000000000011'
CREATE_OPERATION_ID='26202600-0000-4000-8000-000000000012'
STALE_OPERATION_ID='26202600-0000-4000-8000-000000000013'
RESOLVE_OPERATION_ID='26202600-0000-4000-8000-000000000014'
CREATE_KEY='s15-incident-create'
STALE_KEY='s15-incident-stale'
RESOLVE_KEY='s15-incident-resolve'
EDITION_ID="$(db_value "select id::text from public.editions order by created_at asc limit 1;")"
[[ -n "$EDITION_ID" ]] || fail "local fixture has no edition"

log "Seed local-only actor and exact-edition Incident capabilities"
db_exec "
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values ('$ACTOR_ID','authenticated','authenticated','s15-incident@solaris.invalid','',now(),now(),now())
on conflict (id) do nothing;

insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$ACTOR_ID','incident.manage','$EDITION_ID'::uuid),
  ('$ACTOR_ID','incident.resolve','$EDITION_ID'::uuid)
on conflict do nothing;
"

log "Create through the canonical operation boundary"
CREATE_RESULT="$(as_user "$ACTOR_ID" "select public.studio2_apply_incident_command_v3('$EDITION_ID'::uuid,null,'create',null,jsonb_build_object('title','S15 Incident Fixture','severity','sev2','category','operations','description','local rehearsal','affectedSystems',jsonb_build_array('studio')),'local rehearsal create','$CREATE_OPERATION_ID'::uuid,'$CREATE_KEY','$CREATE_OPERATION_ID'::uuid)::text;")"
INCIDENT_ID="$(printf '%s' "$CREATE_RESULT" | sed -n 's/.*\"incidentId\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p')"
[[ -n "$INCIDENT_ID" ]] || fail "canonical create did not return incidentId: $CREATE_RESULT"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$CREATE_OPERATION_ID'::uuid and event_type='incident.changed';")" == '1' ]] || fail "create did not emit exactly one incident.changed"
VERSION="$(db_value "select version::text from public.studio2_incidents where id='$INCIDENT_ID'::uuid;")"
[[ -n "$VERSION" ]] || fail "created incident has no version"

log "Exact lost-response replay must return the original success without a second mutation/event"
as_user "$ACTOR_ID" "select public.studio2_apply_incident_command_v3('$EDITION_ID'::uuid,null,'create',null,jsonb_build_object('title','S15 Incident Fixture','severity','sev2','category','operations','description','local rehearsal','affectedSystems',jsonb_build_array('studio')),'local rehearsal create','$CREATE_OPERATION_ID'::uuid,'$CREATE_KEY','$CREATE_OPERATION_ID'::uuid)::text;" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$CREATE_OPERATION_ID'::uuid and event_type='incident.changed';")" == '1' ]] || fail "replay duplicated incident.changed"
[[ "$(db_value "select count(*) from public.studio2_incidents where id='$INCIDENT_ID'::uuid;")" == '1' ]] || fail "replay duplicated incident"

log "A stale expected version must be rejected without an event"
set +e
STALE_OUTPUT="$(as_user "$ACTOR_ID" "select public.studio2_apply_incident_command_v3('$EDITION_ID'::uuid,'$INCIDENT_ID'::uuid,'update',0,jsonb_build_object('description','stale write'),'stale rehearsal','$STALE_OPERATION_ID'::uuid,'$STALE_KEY','$STALE_OPERATION_ID'::uuid)::text;" 2>&1)"
STALE_STATUS=$?
set -e
[[ "$STALE_STATUS" -ne 0 ]] || fail "stale update unexpectedly succeeded"
[[ "$STALE_OUTPUT" == *"VALIDATION"* || "$STALE_OUTPUT" == *"VERSION_CONFLICT"* ]] || fail "stale update failed for an unexpected reason: $STALE_OUTPUT"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$STALE_OPERATION_ID'::uuid;")" == '0' ]] || fail "stale operation emitted a DomainEvent"

log "Incident response task must exist while the incident is active"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where edition_id='$EDITION_ID'::uuid and source_kind='incident' and source_id='$INCIDENT_ID' and task_type='incident.response' and state <> 'resolved';")" == '1' ]] || fail "active incident response task was not reconciled"

log "Resolve through the canonical R3 operation and reconcile the task"
CURRENT_VERSION="$(db_value "select version::text from public.studio2_incidents where id='$INCIDENT_ID'::uuid;")"
as_user "$ACTOR_ID" "select public.studio2_apply_incident_command_v3('$EDITION_ID'::uuid,'$INCIDENT_ID'::uuid,'transition',$CURRENT_VERSION,jsonb_build_object('to','resolved'),'resolved by local rehearsal','$RESOLVE_OPERATION_ID'::uuid,'$RESOLVE_KEY','$RESOLVE_OPERATION_ID'::uuid)::text;" >/dev/null
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$RESOLVE_OPERATION_ID'::uuid and event_type='incident.changed';")" == '1' ]] || fail "resolve did not emit exactly one incident.changed"
[[ "$(db_value "select status from public.studio2_incidents where id='$INCIDENT_ID'::uuid;")" == 'resolved' ]] || fail "incident did not resolve"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where edition_id='$EDITION_ID'::uuid and source_kind='incident' and source_id='$INCIDENT_ID' and task_type='incident.response' and state='resolved';")" == '1' ]] || fail "resolved incident task did not reconcile"

log "Canonical readback must return the resolved version"
READBACK="$(as_user "$ACTOR_ID" "select public.studio2_incident_command_projection('$EDITION_ID'::uuid,'$INCIDENT_ID'::uuid,10)::text;")"
[[ "$READBACK" == *'"status": "resolved"'* || "$READBACK" == *'"status":"resolved"'* ]] || fail "canonical readback did not show resolved incident"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='incident' and aggregate_id='$INCIDENT_ID';")" == '2' ]] || fail "incident lineage is not exactly create + resolve"

log "PASS: canonical Incident operation -> one event per operation -> deterministic task reconciliation -> authoritative readback"
