#!/usr/bin/env bash
set -euo pipefail

log() { printf '[v3-s15-community-moderation] %s\n' "$*"; }
fail() { printf '[v3-s15-community-moderation] ERROR: %s\n' "$*" >&2; exit 1; }

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
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql" \
    | tail -n1 | tr -d '\r'
}

MODERATOR_ID='26202000-0000-4000-8000-000000000001'
PROFILE_ID='26202000-0000-4000-8000-000000000002'
HIDE_OPERATION_ID='26202000-0000-4000-8000-000000000003'
RESTORE_OPERATION_ID='26202000-0000-4000-8000-000000000004'
HIDE_KEY='s15-community-hide'
RESTORE_KEY='s15-community-restore'

log "Seed a local moderator and public fan profile"
db_exec "
insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,created_at,updated_at)
values
  ('$MODERATOR_ID','authenticated','authenticated','s15-community-moderator@solaris.invalid','',now(),now(),now()),
  ('$PROFILE_ID','authenticated','authenticated','s15-community-profile@solaris.invalid','',now(),now(),now())
on conflict (id) do nothing;

insert into public.fan_profiles(id,display_name,visibility,leaderboard_opt_in)
values ('$PROFILE_ID','Community Fixture','public',true)
on conflict (id) do update set
  display_name='Community Fixture',
  visibility='public',
  leaderboard_opt_in=true,
  moderation_hidden_at=null,
  moderation_reason=null,
  moderated_by=null,
  moderation_revision=0,
  updated_at=now();

delete from public.studio2_capability_grants
where user_id='$MODERATOR_ID'::uuid and capability in ('community.read','community.moderate');
"

log "Unauthorized moderation must fail without a receipt or event"
set +e
UNAUTHORIZED_OUTPUT="$(as_user "$MODERATOR_ID" "select public.admin_set_fan_profile_moderation('$PROFILE_ID'::uuid,true,'fixture reason','$HIDE_OPERATION_ID'::uuid,'$HIDE_KEY')::text;" 2>&1)"
UNAUTHORIZED_STATUS=$?
set -e
[[ "$UNAUTHORIZED_STATUS" -ne 0 ]] || fail "moderation succeeded without community.moderate"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id='$HIDE_OPERATION_ID'::uuid;")" == '0' ]] || fail "unauthorized moderation persisted an operation receipt"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$HIDE_OPERATION_ID'::uuid;")" == '0' ]] || fail "unauthorized moderation emitted a DomainEvent"

log "Grant canonical moderation/read capabilities and hide the profile"
db_exec "
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
  ('$MODERATOR_ID','community.read',null),
  ('$MODERATOR_ID','community.moderate',null)
on conflict do nothing;
"

HIDE_RESULT="$(as_user "$MODERATOR_ID" "select public.admin_set_fan_profile_moderation('$PROFILE_ID'::uuid,true,'fixture reason','$HIDE_OPERATION_ID'::uuid,'$HIDE_KEY')::text;")"
[[ "$HIDE_RESULT" == *'"hidden": true'* || "$HIDE_RESULT" == *'"hidden":true'* ]] || fail "canonical hide operation did not report hidden=true"
[[ "$(db_value "select moderation_revision::text from public.fan_profiles where id='$PROFILE_ID'::uuid;")" == '1' ]] || fail "first moderation did not advance revision to 1"
[[ -n "$(db_value "select moderation_hidden_at::text from public.fan_profiles where id='$PROFILE_ID'::uuid;")" ]] || fail "canonical profile was not hidden"

HIDE_EVENT_ID="$(db_value "select id::text from private.v3_domain_events where operation_id='$HIDE_OPERATION_ID'::uuid and event_type='community_profile.moderated';")"
[[ -n "$HIDE_EVENT_ID" ]] || fail "community_profile.moderated was not emitted"
[[ "$(db_value "select aggregate_version::text from private.v3_domain_events where id='$HIDE_EVENT_ID'::uuid;")" == '1' ]] || fail "hide event did not use moderation revision 1"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$HIDE_EVENT_ID'::uuid;")" == '0' ]] || fail "community moderation fabricated an async outbox consumer"
[[ "$(db_value "select payload ? 'moderationReason' from private.v3_domain_events where id='$HIDE_EVENT_ID'::uuid;")" == 'f' ]] || fail "DomainEvent leaked moderation reason"
[[ "$(db_value "select payload ? 'moderatedBy' from private.v3_domain_events where id='$HIDE_EVENT_ID'::uuid;")" == 'f' ]] || fail "DomainEvent leaked moderator identity"

READBACK="$(as_user "$MODERATOR_ID" "select public.admin_fan_profile_moderation(20,'Community Fixture')::text;")"
[[ "$READBACK" == *'Community Fixture'* ]] || fail "canonical moderation readback did not return profile"
[[ "$READBACK" == *'fixture reason'* ]] || fail "authorized Organizer readback lost private moderation reason"

log "Exact operation replay must not advance revision or duplicate the event"
as_user "$MODERATOR_ID" "select public.admin_set_fan_profile_moderation('$PROFILE_ID'::uuid,true,'fixture reason','$HIDE_OPERATION_ID'::uuid,'$HIDE_KEY')::text;" >/dev/null
[[ "$(db_value "select moderation_revision::text from public.fan_profiles where id='$PROFILE_ID'::uuid;")" == '1' ]] || fail "operation replay advanced moderation revision"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$HIDE_OPERATION_ID'::uuid and event_type='community_profile.moderated';")" == '1' ]] || fail "operation replay duplicated DomainEvent"

log "Restore identity through a second canonical operation"
as_user "$MODERATOR_ID" "select public.admin_set_fan_profile_moderation('$PROFILE_ID'::uuid,false,'Restored by Organizer','$RESTORE_OPERATION_ID'::uuid,'$RESTORE_KEY')::text;" >/dev/null
[[ "$(db_value "select moderation_revision::text from public.fan_profiles where id='$PROFILE_ID'::uuid;")" == '2' ]] || fail "restore did not advance moderation revision to 2"
[[ "$(db_value "select moderation_hidden_at is null from public.fan_profiles where id='$PROFILE_ID'::uuid;")" == 't' ]] || fail "canonical profile was not restored"
[[ "$(db_value "select aggregate_version::text from private.v3_domain_events where operation_id='$RESTORE_OPERATION_ID'::uuid and event_type='community_profile.moderated';")" == '2' ]] || fail "restore event did not use moderation revision 2"
[[ "$(db_value "select count(*) from private.v3_domain_events where aggregate_type='community_profile' and aggregate_id='$PROFILE_ID';")" == '2' ]] || fail "moderation lineage is not exactly two events"

log "PASS: authorized R2 moderation -> monotonic canonical state -> privacy-bounded DomainEvent -> idempotent replay"
