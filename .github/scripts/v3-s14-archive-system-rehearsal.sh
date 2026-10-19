#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-s14-archive-system] %s\n' "$*"; }
fail() { printf '\n[v3-s14-archive-system] FAIL: %s\n' "$*" >&2; printf '::error::%s\n' "$*"; exit 1; }

# Destructive fixture work. This rehearsal must remain local-only.
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
  *) fail "Refusing non-local database rehearsal" ;;
esac

export SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY"
export E2E_SUPABASE_URL="$API_URL" VITE_SUPABASE_URL="$API_URL"
export CONFIRMATIONS_SUPABASE_URL="$API_URL" VITE_CONFIRMATIONS_SUPABASE_URL="$API_URL"
export DATABASE_URL="$DB_URL"
export SUPABASE_PROJECT_ID=local SUPABASE_PROJECT_REF=local
export E2E_SUPABASE_PROJECT_ID=local E2E_SUPABASE_PROJECT_REF=local
export VITE_SUPABASE_PROJECT_ID=local VITE_SUPABASE_PROJECT_REF=local
export V3_VERIFICATION_TARGET=local V3_SEED_TARGET=local V3_CLEANUP_TARGET=local
export V3_DESTRUCTIVE_VERIFICATION=1 V3_SERVICE_ROLE_SCOPE=local
bun run scripts/check-v3-production-isolation.ts

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c "$1"; }

as_user() {
  local user_id="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role authenticated; set request.jwt.claims = '{\"sub\":\"$user_id\",\"role\":\"authenticated\"}'; $sql"
}

as_user_fails() {
  local user_id="$1" label="$2" sql="$3" output
  output="$(mktemp)"
  if as_user "$user_id" "$sql" >"$output" 2>&1; then
    cat "$output" >&2
    rm -f "$output"
    fail "$label unexpectedly succeeded"
  fi
  grep -Eq 'IDEMPOTENCY_CONFLICT|STATE_CHANGED|VERSION_CONFLICT|AUTHORIZATION|VALIDATION' "$output" || {
    cat "$output" >&2
    rm -f "$output"
    fail "$label failed without a canonical error code"
  }
  rm -f "$output"
  log "PASS: $label rejected"
}

as_service() {
  local sql="$1"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -Atq -c \
    "set role service_role; set request.jwt.claims = '{\"role\":\"service_role\"}'; $sql"
}

json_value() {
  local path="$1"
  python3 -c '
import json,sys
value=json.load(sys.stdin)
for key in sys.argv[1].split(".") if sys.argv[1] else []:
    value=value[int(key)] if isinstance(value,list) else value[key]
if value is None: print("")
elif isinstance(value,bool): print("true" if value else "false")
elif isinstance(value,(dict,list)): print(json.dumps(value,separators=(",",":"),sort_keys=True))
else: print(value)
' "$path"
}

EDITION_ID='18900000-0000-4000-8000-000000000001'
SHOW_ID='18900000-0000-4000-8000-000000000002'
COUNTRY_ID='18900000-0000-4000-8000-000000000003'
RESULT_ID='18900000-0000-4000-8000-000000000004'
TASK_ID='18900000-0000-4000-8000-000000000005'
RESULTS_OPERATION='18900000-0000-4000-8000-000000000006'
POST_OPERATION='18900000-0000-4000-8000-000000000007'
ARCHIVE_OPERATION='18900000-0000-4000-8000-000000000008'
RESULTS_KEY='s14-results-runtime-reconcile-1890'
POST_KEY='s14-post-edition-1890'
ARCHIVE_KEY='s14-archive-1890'
ORGANIZER_EMAIL='s14-archive-system@solaris.invalid'

log "Create a local organizer identity without a reusable login secret"
USER_BODY="$(python3 -c 'import json,sys; print(json.dumps({"email":sys.argv[1],"email_confirm":True,"user_metadata":{"display_name":"S14 Archive System Organizer"}}))' "$ORGANIZER_EMAIL")"
USER_RESPONSE="$(curl -sS -X POST "$API_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_ROLE_KEY" \
  -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  -H 'Content-Type: application/json' \
  --data "$USER_BODY")"
ORGANIZER_ID="$(printf '%s' "$USER_RESPONSE" | json_value id 2>/dev/null || true)"
if [[ -z "$ORGANIZER_ID" ]]; then
  ORGANIZER_ID="$(db_value "select id::text from auth.users where lower(email)=lower('$ORGANIZER_EMAIL') limit 1;")"
fi
[[ -n "$ORGANIZER_ID" ]] || fail "local organizer identity could not be created"

log "Seed one exact, release-ready Grand Final result version"
db_exec "
update public.studio2_platform_operational_state
set mode='normal', updated_at=now()
where singleton=true;

insert into public.countries(id,name,short_code,region)
values ('$COUNTRY_ID','S14 Archive System Country','S14SYS','S14 archive')
on conflict (id) do update set name=excluded.name;

insert into public.editions(id,name,slug,edition_number,year,status,published)
values ('$EDITION_ID','S14 Archive System','s14-archive-system',1890,2026,'active',false)
on conflict (id) do update set name=excluded.name,status='active',published=false;

insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values ('$SHOW_ID','$EDITION_ID','S14 Grand Final','grand-final',99,false,'{}'::jsonb)
on conflict (id) do update set kind='grand-final',published=false,publication_config='{}'::jsonb;

insert into public.studio2_edition_runtime(edition_id,state,subsystems,version,updated_by)
values ('$EDITION_ID','submissions',private.studio2_default_subsystems('submissions'),7,null)
on conflict (edition_id) do update
set state='submissions',subsystems=private.studio2_default_subsystems('submissions'),version=7,updated_by=null;

insert into public.results(
 id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank
) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',12,10,22,1)
on conflict (id) do update
set jury_points=12,televote_points=10,total_points=22,final_rank=1;

insert into public.studio2_result_operations(
 show_id,edition_id,calculation_version,last_calculated_at,
 reviewed_version,reviewed_at,locked_version,locked_at,
 reveal_ready_version,reveal_ready_at
) values (
 '$SHOW_ID','$EDITION_ID',1,now(),1,now(),1,now(),1,now()
)
on conflict (show_id) do update
set calculation_version=1,last_calculated_at=now(),
    reviewed_version=1,reviewed_at=now(),
    locked_version=1,locked_at=now(),
    reveal_ready_version=1,reveal_ready_at=now(),updated_at=now();
"

[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID'::uuid and version=1 and result_row_count=1;")" == '1' ]] || fail "immutable result version was not captured"
[[ "$(db_value "select private.v3_publication_result_version_release_ready('$SHOW_ID'::uuid,1);")" == 't' ]] || fail "result version is not release-ready"

log "Publish the actual Results layer with exact immutable provenance"
db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      published=true,
      updated_at=now()
  where id='$SHOW_ID'::uuid;

  update public.studio2_show_publication_controls
  set state='public',
      version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'::uuid),
      source_result_version=1,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id='$SHOW_ID'::uuid;
commit;"

[[ "$(db_value "select state || ':' || source_result_version::text from public.studio2_show_publication_controls where show_id='$SHOW_ID'::uuid;")" == 'public:1' ]] || fail "Grand Final publication lacks exact result provenance"
[[ "$(db_value "select (private.studio2_normalise_publication_config(frozen_config)->>'results')::boolean from public.studio2_show_publication_controls where show_id='$SHOW_ID'::uuid;")" == 't' ]] || fail "Grand Final Results layer is not public"
[[ "$(db_value "select private.v3_edition_final_results_ready('$EDITION_ID'::uuid);")" == 't' ]] || fail "S14 final-results readiness did not recognize canonical publication"

log "Seed one actionable current-contest task plus notification/delivery history"
db_exec "
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values
 ('$ORGANIZER_ID'::uuid,'edition.manage','$EDITION_ID'::uuid),
 ('$ORGANIZER_ID'::uuid,'edition.archive','$EDITION_ID'::uuid)
on conflict do nothing;

insert into public.studio2_organizer_tasks(
 id,edition_id,assigned_to,source_kind,source_id,source_key,task_type,required_capability,
 priority,state,title,description,href,resolution_predicate
) values (
 '$TASK_ID','$EDITION_ID','$ORGANIZER_ID','result_operation','$SHOW_ID',
 's14-system:results-blocked','results.blocked','edition.manage','high','open',
 'Results need intervention','S14 archive system fixture','/admin/results','{}'::jsonb
) on conflict (id) do update set state='open',resolved_at=null,updated_at=now();

select private.studio2_sync_task_notifications('$EDITION_ID'::uuid);

insert into public.notification_deliveries(
 user_id,category,event_type,subject_id,dedupe_key,route,title,body,scheduled_for,status
) values (
 '$ORGANIZER_ID','organizer_tasks','organizer.task.action_required','$TASK_ID',
 's14-system-archive-delivery','/admin/results','Results need intervention','S14 archive system fixture',now(),'pending'
) on conflict (user_id,dedupe_key) do update set status='pending',error=null;
"

[[ "$(db_value "select count(*) from public.admin_notifications where source_key='s14-system:results-blocked';")" -ge 1 ]] || fail "task notification fixture was not projected"

log "Reconcile the coarse multi-show edition runtime to results without fake phase hops"
RESULTS_JSON="$(as_user "$ORGANIZER_ID" "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'results',null,null,7,'$RESULTS_OPERATION'::uuid,'$RESULTS_KEY');")"
[[ "$(printf '%s' "$RESULTS_JSON" | json_value state)" == 'results' ]] || fail "runtime reconciliation did not reach results"
[[ "$(printf '%s' "$RESULTS_JSON" | json_value reconciledFromFinalPublication)" == 'true' ]] || fail "results transition was not marked as final-publication reconciliation"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'results' ]] || fail "canonical runtime did not reach results"

SNAPSHOT_HASH="$(db_value "select md5(result_rows::text) from private.v3_result_versions where show_id='$SHOW_ID'::uuid and version=1;")"
PUBLICATION_HASH="$(db_value "select md5((to_jsonb(control)-'updated_at')::text) from public.studio2_show_publication_controls control where show_id='$SHOW_ID'::uuid;")"

log "Stage 10 uses only results -> post_edition -> archived"
POST_JSON="$(as_user "$ORGANIZER_ID" "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'post_edition',null,null,8,'$POST_OPERATION'::uuid,'$POST_KEY');")"
[[ "$(printf '%s' "$POST_JSON" | json_value state)" == 'post_edition' ]] || fail "post-edition command returned the wrong state"

PRE_ARCHIVE_RECEIPT_IDS="$(db_value "select coalesce(array_agg(operation_id order by operation_id)::text,'{}') from public.studio2_operation_receipts where actor_id='$ORGANIZER_ID'::uuid;")"
PRE_ARCHIVE_RECEIPT_COUNT="$(db_value "select count(*) from public.studio2_operation_receipts where actor_id='$ORGANIZER_ID'::uuid;")"

ARCHIVE_JSON="$(as_user "$ORGANIZER_ID" "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'archived',null,null,9,'$ARCHIVE_OPERATION'::uuid,'$ARCHIVE_KEY');")"
[[ "$(printf '%s' "$ARCHIVE_JSON" | json_value state)" == 'archived' ]] || fail "archive command returned the wrong state"
[[ "$(db_value "select state from public.studio2_edition_runtime where edition_id='$EDITION_ID'::uuid;")" == 'archived' ]] || fail "canonical archive truth is missing"
[[ "$(db_value "select status from public.editions where id='$EDITION_ID'::uuid;")" == 'active' ]] || fail "legacy editions.status became a second lifecycle authority"

ARCHIVE_EVENT="$(db_value "select id::text from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived' limit 1;")"
[[ -n "$ARCHIVE_EVENT" ]] || fail "canonical edition.archived DomainEvent is missing"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived';")" == '1' ]] || fail "archive DomainEvent is not unique"
[[ "$(db_value "select count(*) from private.v3_domain_event_outbox where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == '1' ]] || fail "archive consequence outbox is missing"
[[ "$(db_value "select payload->>'lifecycleAuthority' from private.v3_domain_events where id='$ARCHIVE_EVENT'::uuid;")" == 'studio2_edition_runtime' ]] || fail "archive event did not record canonical lifecycle authority"

log "Exact archive retry replays the receipt without duplicate facts"
LEGACY_ARCHIVE_COUNT="$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")"
REPLAY_JSON="$(as_user "$ORGANIZER_ID" "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'archived',null,null,9,'$ARCHIVE_OPERATION'::uuid,'$ARCHIVE_KEY');")"
[[ "$(printf '%s' "$REPLAY_JSON" | json_value replayed)" == 'true' ]] || fail "archive retry was not identified as replay"
[[ "$(db_value "select count(*) from private.v3_domain_events where operation_id='$ARCHIVE_OPERATION'::uuid and event_type='edition.archived';")" == '1' ]] || fail "archive retry duplicated canonical event"
[[ "$(db_value "select count(*) from public.studio2_contest_events where edition_id='$EDITION_ID'::uuid and type='edition.archived';")" == "$LEGACY_ARCHIVE_COUNT" ]] || fail "archive retry duplicated legacy event"

log "Changed semantics cannot reuse the same archive operation identity"
as_user_fails "$ORGANIZER_ID" "archive semantic idempotency conflict" \
  "select public.studio2_transition_edition_v3('$EDITION_ID'::uuid,'archived','changed semantic request',null,9,'$ARCHIVE_OPERATION'::uuid,'$ARCHIVE_KEY');"

log "Archive outcome remains reconcilable by exact operation identity"
RECONCILED_JSON="$(as_user "$ORGANIZER_ID" "select public.studio2_reconcile_operation('$ARCHIVE_OPERATION'::uuid);")"
[[ "$(printf '%s' "$RECONCILED_JSON" | json_value status)" == 'succeeded' ]] || fail "archive receipt is not succeeded"
[[ "$(printf '%s' "$RECONCILED_JSON" | json_value result.state)" == 'archived' ]] || fail "archive receipt does not retain archived result"

log "Consume the archive consequence through the durable S4 outbox"
CLAIMED_IDS="$(as_service "select coalesce(string_agg(event_id::text,',' order by event_id::text),'') from public.studio2_claim_domain_event_deliveries('edition.tasks','s14-system-archive-worker',100,60);")"
printf '%s' "$CLAIMED_IDS" | tr ',' '\n' | grep -Fxq "$ARCHIVE_EVENT" || fail "archive event was not claimed by edition.tasks"
as_service "select public.studio2_process_edition_domain_event('$ARCHIVE_EVENT'::uuid,'edition.tasks','s14-system-archive-worker');" >/dev/null
[[ "$(db_value "select status from private.v3_domain_event_outbox where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == 'completed' ]] || fail "archive outbox did not complete"
[[ "$(db_value "select count(*) from private.v3_domain_event_consumer_receipts where event_id='$ARCHIVE_EVENT'::uuid and consumer_key='edition.tasks';")" == '1' ]] || fail "archive consequence receipt is missing"

log "Obsolete contest work reconciles away without deleting history"
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "archived Results task remained actionable"
[[ "$(db_value "select count(*) from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == '1' ]] || fail "historical task row was deleted"
[[ "$(db_value "select count(*) from public.admin_notifications where source_key='s14-system:results-blocked' and resolved_at is not null and requires_action=false;")" -ge 1 ]] || fail "resolved task notification still claims action or was deleted"
[[ "$(db_value "select status from public.notification_deliveries where user_id='$ORGANIZER_ID'::uuid and dedupe_key='s14-system-archive-delivery';")" == 'suppressed' ]] || fail "queued archived-work delivery was not suppressed"

log "Immutable results, publication provenance and pre-existing receipts survive Archive"
[[ "$(db_value "select md5(result_rows::text) from private.v3_result_versions where show_id='$SHOW_ID'::uuid and version=1;")" == "$SNAPSHOT_HASH" ]] || fail "immutable result snapshot changed during archive"
[[ "$(db_value "select md5((to_jsonb(control)-'updated_at')::text) from public.studio2_show_publication_controls control where show_id='$SHOW_ID'::uuid;")" == "$PUBLICATION_HASH" ]] || fail "publication provenance changed during archive"
[[ "$(db_value "select count(*) from public.studio2_operation_receipts where operation_id = any('$PRE_ARCHIVE_RECEIPT_IDS'::uuid[]);")" == "$PRE_ARCHIVE_RECEIPT_COUNT" ]] || fail "a pre-existing operation receipt was lost"

log "The canonical task rebuild remains convergent after Archive"
as_service "select private.studio2_reconcile_all_organizer_tasks('$EDITION_ID'::uuid);" >/dev/null
[[ "$(db_value "select state from public.studio2_organizer_tasks where id='$TASK_ID'::uuid;")" == 'resolved' ]] || fail "task rebuild resurrected impossible archived work"

log "S14 archive System rehearsal passed"
