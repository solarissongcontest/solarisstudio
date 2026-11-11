\set ON_ERROR_STOP on
\set edition '00000000-0000-0000-0000-000000000001'
\set show '00000000-0000-0000-0000-000000000002'
\set round '00000000-0000-0000-0000-000000000003'
\set combined '00000000-0000-0000-0000-000000000004'

-- Catch only the operation's exception. The test failure is outside that block,
-- so a P0001 assertion cannot accidentally satisfy a P0001 negative test.
create function extensions.s07_expect_sqlstate(statement text, expected text)
returns void language plpgsql as $$
declare observed text; observed_message text;
begin
  begin
    execute statement;
  exception when others then
    get stacked diagnostics observed=returned_sqlstate, observed_message=message_text;
  end;
  if observed is distinct from expected then
    raise exception 'S07 expected SQLSTATE %, got % (%) for %',expected,coalesce(observed,'SUCCESS'),coalesce(observed_message,'no error'),statement
      using errcode='XX000';
  end if;
end $$;

-- Prove the negative oracle itself detects an unexpected success.
select extensions.s07_expect_sqlstate(
  $$select extensions.s07_expect_sqlstate('select 1','P0001')$$,'XX000');
select extensions.s07_expect_sqlstate(
  $$select extensions.v3_assert(null,'NULL must fail')$$,'P0001');

-- Wrong legacy projection rows must never become an official fallback.
insert into public.televote_votes(edition_id,show_id,country_id,points) values
  (:'edition',:'show','00000000-0000-0000-0000-000000000011',999),
  (:'edition',:'show','00000000-0000-0000-0000-000000000012',999);
truncate private.s07_result_sync_calls;

set role service_role;
select set_config('request.jwt.claim.role','service_role',false);
select extensions.v3_assert(
  (private.v3_sync_published_televote_round(:'round')->>'ok')::boolean,
  'official round rejected');
reset role;

select extensions.v3_assert(
  (select source_type='round' and source_id=:'round' and source_version=1
     and row_count=2 and points_total=22 and projection_revision=1
   from private.v3_televote_result_projection_sources where show_id=:'show'),
  'exact round provenance lost');
select extensions.v3_assert(
  (select sum(points)=22 and count(*)=2 from public.televote_votes where show_id=:'show'),
  'official recipients were not materialized');
select extensions.v3_assert(
  (select count(*)=1 from private.s07_result_sync_calls),
  'bulk import caused duplicate Results reconciliation');

create temp table s07_saved as
select (select jsonb_agg(to_jsonb(v) order by v.id) from public.televote_votes v) as votes,
       (select to_jsonb(s) from private.v3_televote_result_projection_sources s) as source;

set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_round(:'round')->>'replayed')::boolean,
  'exact source replay not reported');
reset role;
select extensions.v3_assert(
  (select votes=(select jsonb_agg(to_jsonb(v) order by v.id) from public.televote_votes v)
     and source=(select to_jsonb(s) from private.v3_televote_result_projection_sources s)
   from s07_saved),
  'healthy replay churned row identity, provenance, timestamp or revision');
select extensions.v3_assert((select count(*)=1 from private.s07_result_sync_calls),
  'healthy replay emitted duplicate Results work');

-- Conflicting same-version data and duplicate recipients cannot replace truth.
set role service_role;
select extensions.s07_expect_sqlstate(format(
  'update televoting.round_results set final_points=99 where round_id=%L;
   select private.v3_sync_published_televote_round(%L)',:'round',:'round'),'42501');
reset role;
-- Mutate upstream only as fixture owner to model corrupt published data.
select extensions.s07_expect_sqlstate(format(
  'update televoting.round_results set final_points=99 where round_id=%L;
   set local role service_role;
   select private.v3_sync_published_televote_round(%L)',:'round',:'round'),'P0001');
select extensions.s07_expect_sqlstate(format(
  'insert into televoting.round_results values (%L,1,''AA'',12);
   set local role service_role;
   select private.v3_sync_published_televote_round(%L)',:'round',:'round'),'23514');

-- Downstream failure rolls back publication, vote replacement and provenance.
insert into televoting.round_results values (:'round',2,'AA',13),(:'round',2,'BB',11);
select set_config('solaris.s07_fail_results_sync','1',false);
select extensions.s07_expect_sqlstate(format(
  'set local role service_role;
   update televoting.rounds set calculation_version=2 where id=%L',:'round'),'P0001');
select set_config('solaris.s07_fail_results_sync','',false);
select extensions.v3_assert((select calculation_version=1 from televoting.rounds where id=:'round'),
  'failed publication committed source revision');
select extensions.v3_assert(
  (select votes=(select jsonb_agg(to_jsonb(v) order by v.id) from public.televote_votes v)
   and source=(select to_jsonb(s) from private.v3_televote_result_projection_sources s) from s07_saved),
  'failed publication left partial projection state');

select extensions.s07_expect_sqlstate(format(
  'update public.televoting_round_bindings set edition_id=''00000000-0000-0000-0000-000000000099'';
   set local role service_role;
   select private.v3_sync_published_televote_round(%L)',:'round'),'23514');

-- Nonpublic and Combined-only round paths return refusal, never legacy data.
update televoting.rounds set results_status='draft' where id=:'round';
set role service_role;
select extensions.v3_assert(
  private.v3_sync_published_televote_round(:'round')->>'status'='source_not_published',
  'unpublished source silently accepted');
reset role;
update televoting.rounds set results_status='published' where id=:'round';
update televoting.rounds set broadcast_display_mode='combined' where id=:'round';
set role service_role;
select extensions.v3_assert(
  private.v3_sync_published_televote_round(:'round')->>'status'='waiting_for_combined',
  'Combined-only round fell back to round results');
reset role;
select extensions.v3_assert(
  (select votes=(select jsonb_agg(to_jsonb(v) order by v.id) from public.televote_votes v) from s07_saved),
  'refused source mutated existing votes');

-- Trusted adapters own materialization; even the service API cannot invent a
-- payload/source receipt through the internal arbitrary-payload helper.
set role service_role;
select extensions.s07_expect_sqlstate(
  $$select private.v3_apply_published_televote_projection(null,null,'manual','x',1,now(),'[]')$$,'42501');
reset role;
set role anon;
select extensions.s07_expect_sqlstate(format(
  'select private.v3_sync_published_televote_round(%L)',:'round'),'42501');
reset role;
set role authenticated;
select extensions.s07_expect_sqlstate(format(
  'select private.v3_sync_published_televote_aggregation(%L)',:'combined'),'42501');
select extensions.s07_expect_sqlstate(
  'select * from private.v3_televote_result_projection_sources','42501');
reset role;
insert into public.shows values
  ('00000000-0000-0000-0000-000000000005',:'edition');
set role app_user;
select set_config('request.jwt.claim.role','service_role',false);
select set_config('solaris.v3_televote_projection_write','1',false);
select set_config('solaris.v3_televote_projection_bulk_replace','1',false);
select extensions.s07_expect_sqlstate(
  'update public.televote_votes set points=999','42501');
select extensions.s07_expect_sqlstate(
  'delete from public.televote_votes','42501');
select extensions.s07_expect_sqlstate(
  'update public.televote_votes set show_id=''00000000-0000-0000-0000-000000000005''','42501');
reset role;
select set_config('solaris.v3_televote_projection_write','',false);
select set_config('solaris.v3_televote_projection_bulk_replace','',false);

-- Incomplete Combined binding must preserve the official current source.
insert into televoting.televote_aggregation_sources values
  (:'combined','00000000-0000-0000-0000-000000000099',true);
set role service_role;
select extensions.v3_assert(
  private.v3_sync_published_televote_aggregation(:'combined')->>'status'='unbound_show',
  'partial Combined binding silently selected one round');
reset role;
select extensions.v3_assert(
  (select source_type='round' and source_id=:'round' from private.v3_televote_result_projection_sources),
  'rejected Combined lost prior source identity');
delete from televoting.televote_aggregation_sources
where source_round_id='00000000-0000-0000-0000-000000000099';
set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_aggregation(:'combined')->>'ok')::boolean,
  'official Combined rejected');
select extensions.v3_assert(
  (private.v3_sync_published_televote_aggregation(:'combined')->>'replayed')::boolean,
  'Combined retry not stable');
select extensions.v3_assert(
  public.studio2_televote_projection_status(:'show')->>'sourceId'=:'combined',
  'authorized readback lost Combined provenance');
reset role;
select extensions.v3_assert(
  (select source_type='combined' and source_id=:'combined' and source_version=1
     and points_total=44 and projection_revision=2
   from private.v3_televote_result_projection_sources),
  'count/reconcile replaced canonical Combined source identity');
select extensions.s07_expect_sqlstate(format(
  'update televoting.rounds set broadcast_display_mode=''round'' where id=%L',:'round'),'40001');
select extensions.v3_assert(
  (select source_type='combined' and source_id=:'combined' from private.v3_televote_result_projection_sources),
  'stale round displaced newer Combined truth');
select extensions.v3_assert((select count(*)=2 from private.s07_result_sync_calls),
  'Combined replay duplicated downstream consequences');
select extensions.v3_assert(
  (select count(*)=1 and bool_and(status='accepted') from televoting.vote_submissions),
  'published-result recovery changed accepted ballots');
select 'PASS S07: official source identity, owner-only payload writer, no-op replay, atomic failure and no fallback';
