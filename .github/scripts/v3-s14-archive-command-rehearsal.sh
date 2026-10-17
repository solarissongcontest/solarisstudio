#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-command] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-command] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in http://127.0.0.1:*|http://localhost:*) ;; *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;; esac
case "$DB_URL" in postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@localhost:*) ;; *) fail "Refusing non-local database rehearsal" ;; esac

export SUPABASE_URL="$API_URL" E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL" SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }

USER_ID='19000000-0000-4000-8000-000000000001'
EDITION_ID='19000000-0000-4000-8000-000000000002'
OPERATION_ID='19000000-0000-4000-8000-000000000003'
STALE_OPERATION_ID='19000000-0000-4000-8000-000000000004'
IDEMPOTENCY_KEY='s14-archive-command-v3'
STALE_IDEMPOTENCY_KEY='s14-archive-command-v3-stale'

log "Seed isolated Archive command state"
db_exec "
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('$USER_ID','authenticated','authenticated','s14-archive-command@local.invalid',now(),now())
on conflict (id) do nothing;
insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Archive Command','s14-archive-command',1900,2026,'completed',true)
on conflict (id) do update set status='completed',published=true;
insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_ID','post_edition',private.studio2_default_subsystems('post_edition'),11,null)
on conflict (edition_id) do update
set state='post_edition',subsystems=private.studio2_default_subsystems('post_edition'),version=11,updated_by=null;
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('$USER_ID','edition.archive','$EDITION_ID')
on conflict do nothing;
"

as_user() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claim.sub', '$USER_ID', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
$sql
commit;
SQL
}

log "Legacy Archive path is blocked at the canonical runtime boundary"
if as_user "select to_jsonb(public.studio2_transition_edition_v2('$EDITION_ID'::uuid,'archived',null,null));" >/dev/null 2>&1; then
  fail "legacy v2 Archive transition unexpectedly succeeded"
fi
[[ "$(db "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'post_edition' ]] || fail "legacy transition changed Archive truth"

log "Stale optimistic version fails closed"
if as_user "select public.studio2_archive_edition_v3('$EDITION_ID'::uuid,10,'$STALE_OPERATION_ID'::uuid,'$STALE_IDEMPOTENCY_KEY',null);" >/dev/null 2>&1; then
  fail "stale Archive version unexpectedly succeeded"
fi
[[ "$(db "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == '11' ]] || fail "stale command changed runtime version"

log "Archive commits exactly once with caller-owned operation identity"
as_user "select public.studio2_archive_edition_v3('$EDITION_ID'::uuid,11,'$OPERATION_ID'::uuid,'$IDEMPOTENCY_KEY',null);" >/dev/null
[[ "$(db "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'archived' ]] || fail "Archive state missing"
[[ "$(db "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == '12' ]] || fail "Archive did not increment runtime exactly once"
[[ "$(db "select count(*) from public.studio2_operation_receipts where operation_id='$OPERATION_ID'::uuid and idempotency_key='$IDEMPOTENCY_KEY' and command='edition.transition.archived' and status='succeeded';")" == '1' ]] || fail "canonical Archive receipt missing"
[[ "$(db "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='edition.archived';")" == '1' ]] || fail "canonical Archive DomainEvent missing"
[[ "$(db "select count(*) from private.v3_domain_event_outbox outbox join private.v3_domain_events event on event.id=outbox.event_id where event.operation_id='$OPERATION_ID'::uuid and event.event_type='edition.archived' and outbox.consumer_key='edition.tasks';")" == '1' ]] || fail "Archive consequence outbox missing"
[[ "$(db "select status from public.editions where id='$EDITION_ID'::uuid;")" == 'completed' ]] || fail "legacy edition status became a second Archive authority"

log "Lost-response replay returns the original result without a second mutation"
as_user "select public.studio2_archive_edition_v3('$EDITION_ID'::uuid,11,'$OPERATION_ID'::uuid,'$IDEMPOTENCY_KEY',null);" >/dev/null
[[ "$(db "select version from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == '12' ]] || fail "Archive replay mutated runtime twice"
[[ "$(db "select count(*) from private.v3_domain_events where operation_id='$OPERATION_ID'::uuid and event_type='edition.archived';")" == '1' ]] || fail "Archive replay duplicated DomainEvent"
[[ "$(db "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")" == '1' ]] || fail "Archive replay duplicated legacy audit fact"

log "Semantic idempotency conflict is rejected"
if as_user "select public.studio2_archive_edition_v3('$EDITION_ID'::uuid,12,'$OPERATION_ID'::uuid,'$IDEMPOTENCY_KEY',null);" >/dev/null 2>&1; then
  fail "same operation identity accepted different semantic payload"
fi

log "S14 Archive command integrity rehearsal passed"
