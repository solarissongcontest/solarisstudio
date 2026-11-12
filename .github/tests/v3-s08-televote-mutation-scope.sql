\set ON_ERROR_STOP on
\set edition '00000000-0000-0000-0000-000000000001'
\set show '00000000-0000-0000-0000-000000000002'
\set moved_show '00000000-0000-0000-0000-000000000005'
\set round '00000000-0000-0000-0000-000000000003'
\set combined '00000000-0000-0000-0000-000000000004'

-- Runs ONLY after S07's real sourced round/Combined, signed-score and
-- rollback tests, then after installing the LOCAL-ONLY S08 all-show guard.
-- Positive path: the source-owned materializer must still commit a NEW
-- authorized Combined revision after the S08 all-show guard is installed.
-- A replay alone would not prove that legitimate official changes still work.
insert into televoting.combined_televote_results values
  (:'combined',3,'AA',-2),(:'combined',3,'BB',7);
update televoting.televote_aggregations
set calculation_version=3, calculated_at='2026-01-05T00:00:00Z'
where id=:'combined';
set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_aggregation(:'combined')->>'ok')::boolean,
  'S08 canonical newer Combined revision was rejected');
reset role;
select extensions.v3_assert(
  (select source_type='combined' and source_id=:'combined'
     and source_version=3 and points_total=5 and projection_revision=4
   from private.v3_televote_result_projection_sources where show_id=:'show'),
  'S08 valid Combined revision lost provenance/version');
select extensions.v3_assert(
  (select count(*)=2 and sum(points)=5 and min(points)=-2
   from public.televote_votes where show_id=:'show'),
  'S08 canonical write lost signed deductions or recipients');
select extensions.v3_assert((select count(*)=4 from private.s07_result_sync_calls),
  'S08 canonical fresh write failed to emit exactly one Results consequence');

-- Snapshot every official state surface; a denied attempt must not partially
-- change votes, provenance, downstream Results work, or accepted ballots.
create temp table s08_before as
select
  (select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)
   from public.televote_votes v) as vote_rows,
  (select to_jsonb(s) from private.v3_televote_result_projection_sources s
   where s.show_id=:'show') as provenance,
  (select count(*) from private.s07_result_sync_calls) as results_events,
  (select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb)
   from televoting.vote_submissions b) as ballot_rows;

-- Real authenticated API role cannot write even a previously unmanaged show.
-- Marker spoofing never becomes authority.
set role authenticated;
select set_config('request.jwt.claim.role','service_role',false);
select extensions.s07_expect_sqlstate(format(
  'update public.televote_votes set points=777 where show_id=%L',:'show'),'42501');
select extensions.s07_expect_sqlstate(format(
  'insert into public.televote_votes(edition_id,show_id,country_id,points) values(%L,%L,%L,4)',
  :'edition',:'moved_show','00000000-0000-0000-0000-000000000011'),'42501');
reset role;
select set_config('request.jwt.claim.role','',false);

-- Fixture's app_user deliberately still has table DML grants. This proves
-- the database trigger, not UI visibility or GRANT revocation alone, denies
-- illicit writes to OLD managed shows, NEW unmanaged shows and moved links.
set role app_user;
select set_config('request.jwt.claim.role','service_role',false);
select set_config('solaris.v3_televote_projection_write','1',false);
select extensions.s07_expect_sqlstate(format(
  'update public.televote_votes set show_id=%L where show_id=%L',
  :'moved_show',:'show'),'42501');
select extensions.s07_expect_sqlstate(format(
  'update public.televote_votes set edition_id=%L where show_id=%L',
  '00000000-0000-0000-0000-000000000099',:'show'),'42501');
select extensions.s07_expect_sqlstate(format(
  'delete from public.televote_votes where show_id=%L',:'show'),'42501');
select extensions.s07_expect_sqlstate(format(
  'insert into public.televote_votes(edition_id,show_id,country_id,points) values(%L,%L,%L,9)',
  :'edition',:'moved_show','00000000-0000-0000-0000-000000000011'),'42501');
reset role;
select set_config('request.jwt.claim.role','',false);
select set_config('solaris.v3_televote_projection_write','',false);

-- A moved round binding must not project official totals into another show.
-- Fixture's moved show intentionally has zero eligible participants.
select extensions.s07_expect_sqlstate(format(
  'update public.televoting_round_bindings set show_id=%L where remote_round_id=%L; ' ||
  'set local role service_role; select private.v3_sync_published_televote_aggregation(%L)',
  :'moved_show',:'round',:'combined'),'23514');

-- The source must still have the CURRENT eligible show lineup at mutation time.
select extensions.s07_expect_sqlstate(format(
  'update public.participants set participation_status=''withdrawn'' where show_id=%L and country_id=%L; ' ||
  'set local role service_role; select private.v3_sync_published_televote_aggregation(%L)',
  :'show','00000000-0000-0000-0000-000000000011',:'combined'),'23514');

-- Duplicate same-version different payload is a conflict, not replacement.
select extensions.s07_expect_sqlstate(format(
  'update televoting.combined_televote_results set final_combined_points=999 ' ||
  'where aggregation_id=%L and calculation_version=3 and country_code=''AA''; ' ||
  'set local role service_role; select private.v3_sync_published_televote_aggregation(%L)',
  :'combined',:'combined'),'P0001');

-- Stale version cannot roll back the signed Combined v2 projection.
select extensions.s07_expect_sqlstate(format(
  'update televoting.televote_aggregations set calculation_version=2 where id=%L; ' ||
  'set local role service_role; select private.v3_sync_published_televote_aggregation(%L)',
  :'combined',:'combined'),'40001');

-- A valid server adapter v3 retry is a stable no-op. The signed source remains
-- official, and no second downstream result synchronization is created.
set role service_role;
select extensions.v3_assert(
  (private.v3_sync_published_televote_aggregation(:'combined')->>'replayed')::boolean,
  'S08 valid canonical replay was rejected');
reset role;

select extensions.v3_assert(
  (select vote_rows = (select coalesce(jsonb_agg(to_jsonb(v) order by v.id),'[]'::jsonb)
                        from public.televote_votes v)
     and provenance = (select to_jsonb(s) from private.v3_televote_result_projection_sources s
                       where s.show_id=:'show')
     and results_events = (select count(*) from private.s07_result_sync_calls)
     and ballot_rows = (select coalesce(jsonb_agg(to_jsonb(b) order by b.id),'[]'::jsonb)
                        from televoting.vote_submissions b)
   from s08_before),
  'S08 denied actor, show, eligibility, duplicate or stale mutation changed official state');
select extensions.v3_assert(
  (select count(*)=0 from private.v3_televote_projection_write_context),
  'S08 canonical writer leaked transaction context');
select 'PASS S08: wrong actor, OLD/NEW moved show, eligibility, duplicate, stale version and stable replay (isolated local candidate)';
