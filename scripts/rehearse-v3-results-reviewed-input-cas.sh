#!/usr/bin/env bash
set -euo pipefail

fail() { printf '%s\n' "[v3-results-review-basis] FAIL: $*" >&2; exit 1; }
eval "$(supabase status -o env)"
: "${API_URL:?missing isolated Supabase API URL}"
: "${DB_URL:?missing isolated Supabase database URL}"

# Only the local disposable Supabase instance is acceptable. Never treat a
# hostname prefix, userinfo, query parameter or proxy URL as proof of locality.
local_api_pattern='^http://(127[.]0[.]0[.]1|localhost):[0-9]+$'
local_db_pattern='^postgres(ql)?://postgres:postgres@(127[.]0[.]0[.]1|localhost):[0-9]+/postgres$'
[[ "$API_URL" =~ $local_api_pattern ]] || fail "Refusing hosted Supabase API"
[[ "$DB_URL" =~ $local_db_pattern ]] || fail "Refusing hosted Supabase database"

# All fixture data lives in a rolled-back transaction. PostgreSQL enforces
# immutable result-version history; test teardown must never bypass its guards.
psql "$DB_URL" -X -v ON_ERROR_STOP=1 -qAt <<'SQL'
begin;
insert into public.countries(id, name, short_code)
values ('00000000-0000-4000-8000-00000000a152', 'Reviewed CAS fixture', 'C52');
insert into public.editions(id,name,year,slug,edition_number,status,published)
values ('00000000-0000-4000-8000-00000000e152','Reviewed CAS fixture edition',
  2026,'reviewed-input-cas-fixture',9152,'active',false);
insert into public.shows(id,edition_id,name,kind,sort_order,published,publication_config)
values ('00000000-0000-4000-8000-00000000b152',
  '00000000-0000-4000-8000-00000000e152','Reviewed CAS fixture show',
  'grand-final',1,false,'{}'::jsonb);

do $assert$
declare
  v_basis bigint;
begin
  select review_basis_version into v_basis
  from public.studio2_result_operations
  where show_id='00000000-0000-4000-8000-00000000b152';
  if v_basis is null or v_basis < 1 then
    raise exception 'SHOW_INSERT_DID_NOT_SEED_REVIEW_BASIS';
  end if;
  if has_function_privilege('anon',
    'public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint)', 'EXECUTE') then
    raise exception 'ANON_CAN_EXECUTE_REVIEWED_COMMIT';
  end if;
  if has_function_privilege('anon',
    'private.studio2_bump_result_review_basis(uuid)', 'EXECUTE') then
    raise exception 'ANON_CAN_BUMP_PRIVATE_RESULTS_AUTHORITY';
  end if;
end
$assert$;

insert into public.results(id,edition_id,show_id,country_id,jury_points,televote_points,total_points,final_rank)
values ('00000000-0000-4000-8000-00000000c152',
  '00000000-0000-4000-8000-00000000e152',
  '00000000-0000-4000-8000-00000000b152',
  '00000000-0000-4000-8000-00000000a152',40,60,100,1);
update public.studio2_result_operations
set calculation_version=1,last_calculated_at=now(),
    reviewed_version=1,reviewed_at=now(),
    locked_version=1,locked_at=now(),
    reveal_ready_version=1,reveal_ready_at=now()
where show_id='00000000-0000-4000-8000-00000000b152';

do $assert$
begin
  if not exists (
    select 1 from private.v3_result_versions
    where show_id='00000000-0000-4000-8000-00000000b152' and version=1
  ) then
    raise exception 'MISSING_IMMUTABLE_RESULT_VERSION';
  end if;
  if not exists (
    select 1 from public.studio2_result_operations
    where show_id='00000000-0000-4000-8000-00000000b152'
      and reviewed_version=1 and locked_version=1 and reveal_ready_version=1
  ) then
    raise exception 'RESULTS_REVIEW_FIXTURE_NOT_FINALIZED';
  end if;
end
$assert$;

create temp table v3_cas_before on commit drop as
select review_basis_version as basis
from public.studio2_result_operations
where show_id='00000000-0000-4000-8000-00000000b152';

-- A voting input changes without an explicit Results recalculate. The AFTER
-- trigger must invalidate the current review and release pointers atomically.
update public.shows
set voting_config=coalesce(voting_config,'{}'::jsonb)||'{"review_basis_probe":true}'::jsonb
where id='00000000-0000-4000-8000-00000000b152';

do $assert$
begin
  if not exists (
    select 1
    from public.studio2_result_operations op, v3_cas_before b
    where op.show_id='00000000-0000-4000-8000-00000000b152'
      and op.review_basis_version > b.basis
      and op.reviewed_version is null
      and op.locked_version is null
      and op.reveal_ready_version is null
  ) then
    raise exception 'VOTING_INPUT_DID_NOT_INVALIDATE_REVIEWED_RELEASE';
  end if;
  if not exists (
    select 1 from private.v3_result_versions
    where show_id='00000000-0000-4000-8000-00000000b152' and version=1
  ) then
    raise exception 'INPUT_MUTATION_ERASED_IMMUTABLE_RESULT_VERSION';
  end if;
  -- Pretend a service caller kept the old Organizer preview after the
  -- canonical voting input advanced. The RPC must fail before it invokes
  -- the existing Results lifecycle engine and must keep the evidence.
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  begin
    perform public.studio2_execute_result_operation_v2(
      '00000000-0000-4000-8000-00000000b152',
      'review',
      'Stale reviewed-input preflight fixture',
      '00000000-0000-4000-8000-00000000f152',
      1,
      (select basis from v3_cas_before)
    );
    raise exception 'STALE_REVIEWED_INPUT_WAS_ACCEPTED';
  exception when sqlstate 'PT409' then
    if not exists (
      select 1 from public.studio2_result_operations op, v3_cas_before b
      where op.show_id='00000000-0000-4000-8000-00000000b152'
        and op.review_basis_version > b.basis
        and op.reviewed_version is null
    ) then
      raise exception 'STALE_REVIEW_REJECTION_CHANGED_AUTHORITY';
    end if;
  end;
  if exists (
    select 1 from public.studio2_result_operation_executions
    where execution_id='00000000-0000-4000-8000-00000000f152'
  ) then
    raise exception 'STALE_REVIEW_EXECUTED_MUTATION';
  end if;
  if not exists (
    select 1 from pg_trigger t
    where t.tgrelid='public.jury_ballot_submissions'::regclass
      and t.tgname='studio2_results_review_basis_jury_submissions'
      and t.tgenabled <> 'D'
  ) then
    raise exception 'JURY_BALLOT_SUBMISSION_INVALIDATION_MISSING';
  end if;
end
$assert$;
rollback;
SQL
printf '%s\n' '[v3-results-review-basis] Isolated reviewed-input CAS rehearsal passed'
