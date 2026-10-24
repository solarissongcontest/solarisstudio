#!/usr/bin/env bash
set -euo pipefail

log() { printf '\n[v3-result-analysis-context] %s\n' "$*"; }
fail() { printf '\n[v3-result-analysis-context] FAIL: %s\n' "$*" >&2; exit 1; }

# This rehearsal creates and mutates fixtures. It is deliberately incapable of
# running against hosted Solaris Supabase.
eval "$(supabase status -o env)"
: "${API_URL:?missing local Supabase API_URL}"
: "${DB_URL:?missing local Supabase DB_URL}"
case "$API_URL" in
  http://127.0.0.1:*|http://localhost:*) ;;
  *) fail "Refusing hosted Supabase rehearsal ($API_URL)" ;;
esac
case "$DB_URL" in
  postgres://postgres:postgres@127.0.0.1:*|postgresql://postgres:postgres@127.0.0.1:*|postgres://postgres:postgres@localhost:*|postgresql://postgres:postgres@localhost:*) ;;
  *) fail "Refusing non-local database rehearsal" ;;
esac

db_exec() { psql "$DB_URL" -v ON_ERROR_STOP=1 -q -c "$1" >/dev/null; }
db_value() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "$1"; }
role_value() {
  local role_name="$1" sql="$2"
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qAt -c "
    begin;
    set local role $role_name;
    $sql
    commit;
  " | tail -n 1
}

COUNTRY_ID='00000000-0000-4000-8000-00000000c635'
EDITION_ID='00000000-0000-4000-8000-00000000e635'
SHOW_ID='00000000-0000-4000-8000-00000000a635'
RESULT_ID='00000000-0000-4000-8000-00000000b635'
ACTOR_ID='00000000-0000-4000-8000-000000009635'
SCHEDULE_OPERATION_ID='00000000-0000-4000-8000-00000000d635'

log "Seeding one isolated finalized Result Version"
db_exec "
insert into auth.users(
  id,aud,role,email,raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values (
  '$ACTOR_ID','authenticated','authenticated','v3-result-context@solaris.invalid',
  '{}'::jsonb,'{}'::jsonb,now(),now()
) on conflict (id) do nothing;
insert into public.countries(id,name,short_code)
values ('$COUNTRY_ID','Result Context Country','RAC');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('$EDITION_ID','Result Context Edition',2026,'result-context-edition',9635,'completed',true);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values ('$SHOW_ID','$EDITION_ID','Result Context Final','final',1,false,'{}'::jsonb);
insert into public.results(
  id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank
) values ('$RESULT_ID','$EDITION_ID','$SHOW_ID','$COUNTRY_ID',12,10,22,1);
insert into public.studio2_result_operations(
  show_id,edition_id,calculation_version,last_calculated_at,
  reviewed_version,reviewed_at,locked_version,locked_at,
  reveal_ready_version,reveal_ready_at
) values ('$SHOW_ID','$EDITION_ID',1,now(),1,now(),1,now(),1,now());
"

[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=1;")" == '1' ]] \
  || fail "immutable Result Version 1 was not captured"

log "Draft/unpublished state fails closed identically"
DRAFT_CONTEXT="$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID',null)::text;")"
[[ "$DRAFT_CONTEXT" == *'"available": false'* ]] || fail "draft show exposed analysis context"
[[ "$DRAFT_CONTEXT" == *'"editionId": null'* ]] || fail "draft context disclosed edition identity"
[[ "$DRAFT_CONTEXT" == *'"resultVersionId": null'* ]] || fail "draft context disclosed result identity"

log "Publishing exact immutable Version 1"
db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      published=true,
      updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public',
      version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=1,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id='$SHOW_ID';
commit;"

VERSION_ONE_ID="result-version:$SHOW_ID:1"
for ROLE in anon authenticated service_role; do
  RESOLVED_ID="$(role_value "$ROLE" "select public.v3_public_result_analysis_context('$SHOW_ID',null)->>'resultVersionId';")"
  [[ "$RESOLVED_ID" == "$VERSION_ONE_ID" ]] \
    || fail "$ROLE did not resolve identical public Result Version 1 identity"
  [[ "$(role_value "$ROLE" "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'requestedVersionIsCurrent';")" == 'true' ]] \
    || fail "$ROLE did not recognize current Result Version 1"
done

[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID','result-version:stale')->>'requestedVersionIsCurrent';")" == 'false' ]] \
  || fail "stale requested identity was accepted as current"
[[ "$(role_value anon "select (public.v3_public_result_analysis_context('$SHOW_ID',null) ? 'resultRows')::text;")" == 'false' ]] \
  || fail "public context leaked immutable snapshot rows"

log "Scheduling from Public fails closed even while the old public Show projection remains visible"
db_exec "update public.studio2_show_publication_controls
set state='scheduled',
    version=version+1,
    scheduled_for=now()+interval '10 minutes',
    scheduled_from_state='public',
    source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
    source_result_version=1,
    scheduled_by='$ACTOR_ID',
    scheduled_operation_id='$SCHEDULE_OPERATION_ID',
    last_failure=null,
    last_failure_at=null,
    updated_at=now()
where show_id='$SHOW_ID';"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'available';")" == 'false' ]] \
  || fail "scheduled publication exposed Result Analysis Context"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'requestedVersionIsCurrent';")" == 'false' ]] \
  || fail "scheduled publication still called old result identity current"

log "Restoring Public then withdrawing makes the prior version unavailable"
db_exec "update public.studio2_show_publication_controls
set state='public',
    version=version+1,
    scheduled_for=null,
    scheduled_from_state=null,
    scheduled_by=null,
    scheduled_operation_id=null,
    source_result_version=1,
    last_failure=null,
    last_failure_at=null,
    updated_at=now()
where show_id='$SHOW_ID';"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID',null)->>'available';")" == 'true' ]] \
  || fail "restored public Version 1 did not become available"

db_exec "begin;
  update public.shows set published=false,updated_at=now() where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='hidden',
      version=version+1,
      source_result_version=null,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id='$SHOW_ID';
commit;"
[[ "$(role_value authenticated "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'available';")" == 'false' ]] \
  || fail "hidden result remained publicly available"
[[ "$(role_value authenticated "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'editionId' is null;")" == 't' ]] \
  || fail "hidden result disclosed edition identity"

log "Publishing a corrected immutable Version 2 replaces, rather than mutates, provenance"
db_exec "update public.results
set jury_points=20,televote_points=10,total_points=30
where id='$RESULT_ID';
update public.studio2_result_operations
set calculation_version=2,
    last_calculated_at=now(),
    reviewed_version=2,
    reviewed_at=now(),
    locked_version=2,
    locked_at=now(),
    reveal_ready_version=2,
    reveal_ready_at=now()
where show_id='$SHOW_ID';"
[[ "$(db_value "select count(*) from private.v3_result_versions where show_id='$SHOW_ID' and version=2;")" == '1' ]] \
  || fail "immutable corrected Result Version 2 was not captured"

db_exec "begin;
  update public.shows
  set publication_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      published=true,
      updated_at=now()
  where id='$SHOW_ID';
  update public.studio2_show_publication_controls
  set state='public',
      version=version+1,
      frozen_config=private.studio2_normalise_publication_config('{\"results\":true}'::jsonb),
      source_show_updated_at=(select updated_at from public.shows where id='$SHOW_ID'),
      source_result_version=2,
      scheduled_for=null,
      scheduled_from_state=null,
      scheduled_by=null,
      scheduled_operation_id=null,
      last_failure=null,
      last_failure_at=null,
      updated_at=now()
  where show_id='$SHOW_ID';
commit;"

VERSION_TWO_ID="result-version:$SHOW_ID:2"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID',null)->>'resultVersionId';")" == "$VERSION_TWO_ID" ]] \
  || fail "corrected public result did not resolve Version 2"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_ONE_ID')->>'requestedVersionIsCurrent';")" == 'false' ]] \
  || fail "corrected publication still called Version 1 current"
[[ "$(role_value anon "select public.v3_public_result_analysis_context('$SHOW_ID','$VERSION_TWO_ID')->>'requestedVersionIsCurrent';")" == 'true' ]] \
  || fail "corrected Version 2 was not recognized as current"

log "System V3 publication-safe Result Analysis Context rehearsal passed"
