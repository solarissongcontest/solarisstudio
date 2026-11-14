\set ON_ERROR_STOP on
-- Actual PostgREST-style LOGIN authenticator session, never owner SET ROLE.
begin;
do $session$ begin
 if session_user<>'authenticator' or current_user<>'authenticator' then raise exception 'Public API proof requires the actual authenticator session';end if;
end $session$;
set local request.jwt.claim.role='anon';
set local request.jwt.claims='{"role":"anon"}';
set local role anon;
\if :published
DO $read$ declare s uuid; p jsonb;begin
 foreach s in array array['51000000-0000-4000-8000-000000000002'::uuid,'51000000-0000-4000-8000-000000000003'::uuid] loop
  if (select count(*) from public.results where show_id=s)<>2 then raise exception 'Frozen active raw Results visibility differs';end if;
  if exists(select 1 from public.results where show_id=s and country_id not in ('51000000-0000-4000-8000-000000000011','51000000-0000-4000-8000-000000000012')) then raise exception 'Historical/pending row exposed';end if;
  p:=public.v3_public_published_result_snapshot(s);
  if p is null or (p->>'rowCount')::integer<>2 or p->'rows'->0 ? 'juryPoints' then raise exception 'Anonymous frozen snapshot count/privacy failed';end if;
 end loop;
end $read$;
\else
DO $hidden$ begin
 if exists(select 1 from public.results where edition_id='51000000-0000-4000-8000-000000000001') then raise exception 'Unpublished edition raw Results exposed';end if;
 if public.v3_public_published_result_snapshot('51000000-0000-4000-8000-000000000002') is not null then raise exception 'Unpublished snapshot exposed';end if;
end $hidden$;
\endif
reset role;
do $deny$ declare actor_role text; denied boolean;begin
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  execute format('set local role %I',actor_role);
  denied:=false;
  begin update public.results set total_points=99999 where show_id='51000000-0000-4000-8000-000000000002';exception when insufficient_privilege then denied:=true;end;
  if not denied then raise exception 'Direct Results API UPDATE accepted: %',actor_role;end if;
  denied:=false;
  begin truncate table public.results;exception when insufficient_privilege then denied:=true;end;
  reset role;
  if not denied then raise exception 'API TRUNCATE accepted: %',actor_role;end if;
 end loop;
end $deny$;
rollback;
select 'PASS: real authenticator session, frozen public readback and API write/TRUNCATE denial';
