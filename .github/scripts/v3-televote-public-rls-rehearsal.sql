-- Disposable transactional fixtures; executed only by the loopback-only runner.
begin;
insert into public.editions(id,name,slug,edition_number,status,published)
values ('16320000-0000-4000-8000-000000000001','RLS boundary','rls-boundary-1632',991632,'draft',false);
insert into public.shows(id,edition_id,name,published) values
 ('16320000-0000-4000-8000-000000000002','16320000-0000-4000-8000-000000000001','Public show',true),
 ('16320000-0000-4000-8000-000000000003','16320000-0000-4000-8000-000000000001','Private show',false);
insert into televoting.editions(id,name) values ('16320000-0000-4000-8000-000000000010','RLS boundary');
insert into televoting.countries(code,name,flag) values ('XRL','RLS country','X');
insert into televoting.rounds(id,edition_id,name,status,results_status) values
 ('16320000-0000-4000-8000-000000000011','16320000-0000-4000-8000-000000000010','draft','draft','draft'),
 ('16320000-0000-4000-8000-000000000012','16320000-0000-4000-8000-000000000010','open','open','draft'),
 ('16320000-0000-4000-8000-000000000013','16320000-0000-4000-8000-000000000010','published','closed','published'),
 ('16320000-0000-4000-8000-000000000014','16320000-0000-4000-8000-000000000010','show-closed','closed','draft'),
 ('16320000-0000-4000-8000-000000000015','16320000-0000-4000-8000-000000000010','private-show','closed','draft'),
 ('16320000-0000-4000-8000-000000000016','16320000-0000-4000-8000-000000000010','unbound','closed','draft');
insert into public.televoting_round_bindings(remote_round_id,remote_edition_id,edition_id,show_id,source_mode)
select r.id::text,r.edition_id::text,'16320000-0000-4000-8000-000000000001'::uuid,
 case when r.name='private-show' then '16320000-0000-4000-8000-000000000003'::uuid
 else '16320000-0000-4000-8000-000000000002'::uuid end,'show'
from televoting.rounds r where r.name in ('draft','show-closed','private-show')
and r.edition_id='16320000-0000-4000-8000-000000000010';
insert into televoting.round_entries(round_id,entry_key,country_code)
select id,'country:XRL','XRL' from televoting.rounds where edition_id='16320000-0000-4000-8000-000000000010';
insert into televoting.round_countries(round_id,country_code,display_order)
select id,'XRL',1 from televoting.rounds where edition_id='16320000-0000-4000-8000-000000000010';
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('16320000-0000-4000-8000-000000000021','authenticated','authenticated','rls-ordinary@local.invalid',now(),now()),
 ('16320000-0000-4000-8000-000000000022','authenticated','authenticated','rls-organizer@local.invalid',now(),now());
-- No legacy Organizer role: prove the specific voting.manage capability works.
insert into public.studio2_capability_grants(user_id,capability,edition_id)
values ('16320000-0000-4000-8000-000000000022','voting.manage',null);

create temporary table v3_televote_rls_rehearsal_marker(id integer) on commit drop;
create function pg_temp.assert_televote_boundary(p_organizer boolean) returns void
language plpgsql security invoker set search_path=pg_catalog,public as $$
declare v_names text[]; v_count integer; v_table text;
begin
 select array_agg(name order by name) into v_names from televoting.rounds
 where edition_id='16320000-0000-4000-8000-000000000010';
 if v_names is distinct from (case when p_organizer then
 array['draft','open','private-show','published','show-closed','unbound']
 else array['open','published','show-closed'] end) then
   raise exception 'Unexpected round visibility: %',v_names;
 end if;
 foreach v_table in array array['round_entries','round_countries'] loop
   -- Filter by literal fixture UUID range, never by an RLS-filtered rounds join.
   execute format('select count(*) from televoting.%I where round_id between %L::uuid and %L::uuid',
     v_table,'16320000-0000-4000-8000-000000000011','16320000-0000-4000-8000-000000000016') into v_count;
   if v_count <> (case when p_organizer then 6 else 2 end) then
     raise exception 'Unexpected % composition visibility: %',v_table,v_count;
   end if;
 end loop;
 if not public.v3_public_televote_round_show_visible('16320000-0000-4000-8000-000000000014')
 or public.v3_public_televote_round_show_visible('16320000-0000-4000-8000-000000000015')
 or public.v3_public_televote_round_show_visible('16320000-0000-4000-8000-000000000016')
 or public.v3_public_televote_round_show_visible(null) then
   raise exception 'Show binding predicate leaked private or missing binding';
 end if;
 if not p_organizer then
   begin
     select count(*) into v_count from public.televoting_round_bindings
     where edition_id='16320000-0000-4000-8000-000000000001';
     if v_count <> 0 then raise exception 'Private binding metadata became readable'; end if;
   exception when insufficient_privilege then null;
   end;
 end if;
end $$;
do $$ begin
 execute format('grant usage on schema %I to anon,authenticated',
   (select nspname from pg_namespace where oid=pg_my_temp_schema()));
end $$;
grant execute on function pg_temp.assert_televote_boundary(boolean) to anon,authenticated;

set local role anon;
select pg_temp.assert_televote_boundary(false);
reset role;
set local role authenticated;
set local request.jwt.claim.role='authenticated';
set local request.jwt.claim.sub='16320000-0000-4000-8000-000000000021';
select pg_temp.assert_televote_boundary(false);
reset role;
set local role authenticated;
set local request.jwt.claim.sub='16320000-0000-4000-8000-000000000022';
select pg_temp.assert_televote_boundary(true);
reset role;

-- Control experiment: invoker rights cannot prove the private binding to anon.
alter function public.v3_public_televote_round_show_visible(uuid) security invoker;
set local role anon;
do $$ begin
 begin
   if public.v3_public_televote_round_show_visible('16320000-0000-4000-8000-000000000014') then
     raise exception 'Private binding unexpectedly readable without definer boundary';
   end if;
 exception when insufficient_privilege then null;
 end;
end $$;
reset role;
alter function public.v3_public_televote_round_show_visible(uuid) security definer;

-- Runtime security properties, not just SQL-source markers.
do $$
declare v_proc pg_proc%rowtype;
begin
 select * into strict v_proc from pg_proc where oid='public.v3_public_televote_round_show_visible(uuid)'::regprocedure;
 if not v_proc.prosecdef or v_proc.provolatile <> 's'
 or not ('search_path=pg_catalog, public'=any(v_proc.proconfig)) then
   raise exception 'Unsafe public visibility helper configuration';
 end if;
 if exists (select 1 from aclexplode(v_proc.proacl) where grantee=0 and privilege_type='EXECUTE') then
   raise exception 'Helper grants execute to PUBLIC';
 end if;
 if not has_function_privilege('anon',v_proc.oid,'EXECUTE')
 or not has_function_privilege('authenticated',v_proc.oid,'EXECUTE') then
   raise exception 'Public policy cannot call visibility helper';
 end if;
end $$;
rollback;
