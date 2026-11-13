\set ON_ERROR_STOP on
-- Isolated container only. Source-exact capture across an actual recovery boundary.
\if :snapshot_before
insert into public.editions(id,name,slug,status,published) values('51000000-0000-4000-8000-000000000001','Synthetic snapshot recovery','synthetic-snapshot-recovery','active',false);
insert into public.countries(id,name,short_code) select ('51000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Synthetic snapshot country '||n,'SR'||n from generate_series(11,15) n;
do $seed$ declare s uuid; n integer; begin
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  insert into public.shows(id,edition_id,name,kind,published) values(s,'51000000-0000-4000-8000-000000000001','Synthetic frozen snapshot',case when s='51000000-0000-4000-8000-000000000002' then 'semi-final' else 'grand-final' end,false);
  for n in 11..15 loop
   insert into public.participants(edition_id,show_id,country_id,participation_status) values('51000000-0000-4000-8000-000000000001',s,('51000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<13 then 'confirmed' when n=13 then 'withdrawn' when n=14 then 'disqualified' else 'pending' end);
   insert into public.results(edition_id,show_id,country_id,total_points,final_rank) values('51000000-0000-4000-8000-000000000001',s,('51000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n<13 then 100-(n-11)*10 else 900 end,case when n=12 then 2 else 1 end)
   on conflict(show_id,country_id) where show_id is not null do update set total_points=excluded.total_points,final_rank=excluded.final_rank;
  end loop;
  insert into public.studio2_result_operations(show_id,edition_id,calculation_version,last_calculated_at) values(s,'51000000-0000-4000-8000-000000000001',1,now())
   on conflict(show_id) do update set calculation_version=1,last_calculated_at=now();
  if not exists(select 1 from private.v3_result_versions where show_id=s and version=1 and result_row_count=5) then raise exception 'Observed old capture fixture not exercised'; end if;
 end loop;
end $seed$;
\else
begin;
do $capture$ declare s uuid; before_rows jsonb; begin
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  select result_rows into before_rows from private.v3_result_versions where show_id=s and version=1;
  update public.studio2_result_operations set calculation_version=2,last_calculated_at=now(),reviewed_version=2,reviewed_at=now(),locked_version=2,locked_at=now(),reveal_ready_version=2,reveal_ready_at=now() where show_id=s;
  if not exists(select 1 from private.v3_result_versions where show_id=s and version=1 and result_row_count=5 and result_rows=before_rows) then raise exception 'Historical frozen evidence changed'; end if;
  if not exists(select 1 from private.v3_result_versions where show_id=s and version=2 and result_row_count=2 and (result_rows->0->>'countryId')::uuid in ('51000000-0000-4000-8000-000000000011','51000000-0000-4000-8000-000000000012')) then raise exception 'New capture did not exclude inactive identities'; end if;
  if (select count(*) from public.results where show_id=s)<>5 then raise exception 'Stored historical Results lost'; end if;
  if public.v3_public_published_result_snapshot(s) is not null then raise exception 'Hidden Results exposed'; end if;
  update public.shows set published=true,publication_config=private.studio2_normalise_publication_config('{"results":true}'::jsonb),updated_at=now() where id=s;
  update public.studio2_show_publication_controls set state='public',version=version+1,source_result_version=2,frozen_config=private.studio2_normalise_publication_config('{"results":true}'::jsonb),source_show_updated_at=(select updated_at from public.shows where id=s),updated_at=now() where show_id=s;
 end loop;
end $capture$;
update public.editions set published=true where id='51000000-0000-4000-8000-000000000001';
set local role anon;
do $public$ declare s uuid; payload jsonb; begin
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  payload:=public.v3_public_published_result_snapshot(s);
  if payload is null or (payload->>'rowCount')::integer<>2 or (payload->>'resultVersion')::integer<>2 or jsonb_array_length(payload->'rows')<>2 or payload->'rows'->0->>'finalRank'<>'1' or payload->'rows'->0 ? 'juryPoints' then raise exception 'Anonymous publication readback/count/rank or private allocation boundary failed: %',payload; end if;
 end loop;
 if public.v3_public_published_result_snapshot('51000000-0000-4000-8000-000000000099') is not null then raise exception 'Unknown show returned data'; end if;
end $public$;
reset role;
-- Current mutable participant status must not reinterpret an immutable version.
update public.participants set participation_status='withdrawn' where country_id='51000000-0000-4000-8000-000000000011' and edition_id='51000000-0000-4000-8000-000000000001';
set local role anon;
do $immutable$ begin
 if (public.v3_public_published_result_snapshot('51000000-0000-4000-8000-000000000002')->>'rowCount')::integer<>2 then raise exception 'Mutable status reinterpreted frozen published evidence'; end if;
end $immutable$;
reset role;
rollback;
select 'PASS: source-exact capture and anonymous frozen snapshot, hidden boundary, historical preservation';
\endif
