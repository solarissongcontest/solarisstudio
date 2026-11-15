\set ON_ERROR_STOP on
-- Owner fixture only; actual anonymous sessions verify readback before/after.
begin;
do $correction$
declare before_versions jsonb;before_participants jsonb;s uuid;denied boolean:=false;
begin
 select jsonb_agg(to_jsonb(v)order by show_id,version) into before_versions
 from private.v3_result_versions v where edition_id='51000000-0000-4000-8000-000000000001';
 select jsonb_agg(to_jsonb(p)order by id) into before_participants from public.participants p
 where edition_id='51000000-0000-4000-8000-000000000001';
 begin
  update public.participants set participation_status='withdrawn'
   where country_id='51000000-0000-4000-8000-000000000011' and edition_id='51000000-0000-4000-8000-000000000001';
 exception when sqlstate '55000' then
  if sqlerrm<>'Make the published result layer private before changing result operations.' then raise;end if;
  denied:=true;
 end;
 if not denied or before_participants is distinct from (select jsonb_agg(to_jsonb(p)order by id) from public.participants p where edition_id='51000000-0000-4000-8000-000000000001') then
  raise exception 'Published input rejection failed atomically';end if;
 -- Open a synthetic private correction window through the existing schema
 -- contract. No release pointers are fabricated or re-enabled after mutation.
 update public.studio2_show_publication_controls set state='hidden',version=version+1
 where edition_id='51000000-0000-4000-8000-000000000001';
 update public.shows set published=false,publication_config=private.studio2_normalise_publication_config('{}'::jsonb)
 where edition_id='51000000-0000-4000-8000-000000000001';
 update public.participants set participation_status='withdrawn'
 where country_id='51000000-0000-4000-8000-000000000011' and edition_id='51000000-0000-4000-8000-000000000001';
 if (select count(*)from public.participants where country_id='51000000-0000-4000-8000-000000000011' and edition_id='51000000-0000-4000-8000-000000000001' and participation_status='withdrawn')<>2 then raise exception 'Private correction did not apply';end if;
 if exists(select 1 from public.studio2_result_operations where edition_id='51000000-0000-4000-8000-000000000001' and (reviewed_version is not null or locked_version is not null or reveal_ready_version is not null)) then raise exception 'Private correction retained stale release pointers';end if;
 if before_versions is distinct from (select jsonb_agg(to_jsonb(v)order by show_id,version)from private.v3_result_versions v where edition_id='51000000-0000-4000-8000-000000000001') then raise exception 'Private correction rewrote immutable historical versions';end if;
 set local role anon;
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  if public.v3_public_published_result_snapshot(s) is not null then raise exception 'Private correction exposed unpublished Results';end if;
 end loop;
 reset role;
end $correction$;
rollback;
