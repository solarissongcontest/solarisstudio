\set ON_ERROR_STOP on
begin;
-- CONTRACTS
-- This proof validates the exact live implementation, exposure and closed
-- source boundaries. The canonical writer harness then runs the independent
-- S3 Confirmation/Jury/Entry invariant scenarios and round/review regression
-- fixtures; neither mechanism names nor cached pass flags can sanction drift.
do $catalog$
declare c jsonb; t text; role_name text; col text; f record; contracts jsonb;
begin
 contracts:=current_setting('test.internal_mechanisms')::jsonb;
 if jsonb_array_length(contracts)<1 then raise exception 'Missing mechanism contracts'; end if;
 for c in select value from jsonb_array_elements(contracts) loop
  select p.*,pg_get_userbyid(p.proowner) as owner_name into f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname||'.'||p.proname||'('||pg_get_function_identity_arguments(p.oid)||')'=c->>'signature';
  if f.oid is null or f.owner_name<>'postgres' or md5(pg_get_functiondef(f.oid))<>c->>'definitionHash' or f.prosecdef<>(c->>'securityDefiner')::boolean or not exists(select 1 from unnest(f.proconfig) x where x like 'search_path=pg_catalog,%pg_temp') then raise exception 'Mechanism implementation/path drift: %',c->>'signature'; end if;
  if exists(select 1 from aclexplode(coalesce(f.proacl,acldefault('f',f.proowner))) a where a.grantee<>f.proowner and a.privilege_type='EXECUTE') then raise exception 'Non-owner execute'; end if;
  foreach role_name in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(role_name,f.oid,'EXECUTE') then raise exception 'Mechanism externally executable: %',c->>'signature'; end if;
  end loop;
  for t in select jsonb_array_elements_text(c->'inputTables') loop
   foreach role_name in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(role_name,t,'INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw input DML: %',t; end if;
    for col in select attname from pg_attribute where attrelid=t::regclass and attnum>0 and not attisdropped loop
     if has_column_privilege(role_name,t,col,'INSERT,UPDATE') then raise exception 'Raw input column DML: %.%',t,col; end if;
    end loop;
   end loop;
  end loop;
 end loop;
end $catalog$;
insert into auth.users(id,aud,role,email) values('29123000-0000-4000-8000-000000000001','authenticated','authenticated','shared-mechanisms@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29123000-0000-4000-8000-000000000011','29123000-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29123000-0000-4000-8000-000000000001','organizer');
insert into public.countries(id,name,short_code) values('29123000-0000-4000-8000-000000000041','Shared mechanism country','SMC');
insert into public.editions(id,name,slug,edition_number,status) values
 ('29123000-0000-4000-8000-000000000021','Shared A','shared-a-29123000',29123000,'active'),
 ('29123000-0000-4000-8000-000000000022','Shared B','shared-b-29123000',29123001,'active');
insert into public.shows(id,edition_id,name,kind,sort_order) values
 ('29123000-0000-4000-8000-000000000031','29123000-0000-4000-8000-000000000021','Shared A','final',1),
 ('29123000-0000-4000-8000-000000000032','29123000-0000-4000-8000-000000000022','Shared B','final',1);
-- A valid short Jury scale with two eligible entries exercises the real open
-- command rather than bypassing its roster/self-vote guard.
update public.shows set voting_config='{"juryEnabled":true,"juryPoints":[12]}' where id='29123000-0000-4000-8000-000000000031';
insert into public.countries(id,name,short_code) values('29123000-0000-4000-8000-000000000042','Shared Jury B','SJB'),('29123000-0000-4000-8000-000000000043','Shared Jury C','SJC');
insert into public.participants(edition_id,show_id,country_id,running_order) values
 ('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000031','29123000-0000-4000-8000-000000000042',1),
 ('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000031','29123000-0000-4000-8000-000000000043',2);
-- Participation status changes require a real edition participation, while
-- these global rows do not alter the two-country show/Jury roster above.
insert into public.participants(edition_id,country_id) values
 ('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000041'),
 ('29123000-0000-4000-8000-000000000022','29123000-0000-4000-8000-000000000041');
insert into public.entries(edition_id,country_id,artist,song_title,status,source) values
 ('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000041','Artist','Song','confirmed','manual'),
 ('29123000-0000-4000-8000-000000000022','29123000-0000-4000-8000-000000000041','Artist B','Song B','confirmed','manual');
insert into public.jury_voting_windows(edition_id,show_id,status) values
 ('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000031','closed'),
 ('29123000-0000-4000-8000-000000000022','29123000-0000-4000-8000-000000000032','closed');
insert into public.submission_rounds(id,edition_id,name,status) values('29123000-0000-4000-8000-000000000051','29123000-0000-4000-8000-000000000021','Shared round','open');
insert into public.submissions(id,edition_id,round_id,instagram_username,country,participating,selection_method) values('29123000-0000-4000-8000-000000000061','29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000051','shared_mechanisms','Shared mechanism country',true,'internal');
insert into public.internal_entries(id,submission_id,artist,song_title) values('29123000-0000-4000-8000-000000000071','29123000-0000-4000-8000-000000000061','Shared artist','Shared song');
select set_config('test.participation.a',(select version::text from public.studio2_participation_status_versions where subject_key='country:29123000-0000-4000-8000-000000000041' and edition_id='29123000-0000-4000-8000-000000000021'),true);
select set_config('test.participation.b',(select version::text from public.studio2_participation_status_versions where subject_key='country:29123000-0000-4000-8000-000000000041' and edition_id='29123000-0000-4000-8000-000000000022'),true);
select set_config('test.jury.a',coalesce((select version from public.studio2_jury_window_versions where edition_id='29123000-0000-4000-8000-000000000021'),0)::text,true);
select set_config('test.jury.b',coalesce((select version from public.studio2_jury_window_versions where edition_id='29123000-0000-4000-8000-000000000022'),0)::text,true);
select set_config('test.review.version',(select version::text from public.studio2_confirmation_review_versions where submission_id='29123000-0000-4000-8000-000000000061'),true);
select set_config('test.entry.version',(select current_version_id::text from public.internal_entries where id='29123000-0000-4000-8000-000000000071'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29123000-0000-4000-8000-000000000001","session_id":"29123000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $canonical$
declare first_result jsonb; replay jsonb;
begin
 perform public.studio2_apply_participation_status('29123000-0000-4000-8000-000000000021','29123000-0000-4000-8000-000000000041',null,'withdrawn','29123000-0000-4000-8000-000000000101','shared:participation',current_setting('test.participation.a')::bigint);
 perform public.studio2_apply_jury_voting_status('29123000-0000-4000-8000-000000000031','open','29123000-0000-4000-8000-000000000102','shared:jury',current_setting('test.jury.a')::bigint);
 first_result:=public.studio2_apply_confirmation_entry_review('internal','29123000-0000-4000-8000-000000000071','pending','Review version proof','29123000-0000-4000-8000-000000000103','shared:review',current_setting('test.review.version')::bigint,current_setting('test.entry.version')::uuid,null);
 replay:=public.studio2_apply_confirmation_entry_review('internal','29123000-0000-4000-8000-000000000071','pending','Review version proof','29123000-0000-4000-8000-000000000103','shared:review',current_setting('test.review.version')::bigint,current_setting('test.entry.version')::uuid,null);
 if replay->'result' is distinct from first_result->'result' or not (replay->>'replayed')::boolean then raise exception 'Review exact retry did not read back'; end if;
 begin
  perform public.studio2_apply_confirmation_entry_review('internal','29123000-0000-4000-8000-000000000071','pending','Stale version proof','29123000-0000-4000-8000-000000000104','shared:stale',current_setting('test.review.version')::bigint,current_setting('test.entry.version')::uuid,null);
  raise exception 'Stale review accepted';
 exception when sqlstate 'PT409' then null; end;
end $canonical$;
reset role;
do $bounded$
begin
 if (select version from public.studio2_participation_status_versions where subject_key='country:29123000-0000-4000-8000-000000000041' and edition_id='29123000-0000-4000-8000-000000000021')<=current_setting('test.participation.a')::bigint then raise exception 'Participation CAS did not advance'; end if;
 if (select version from public.studio2_participation_status_versions where subject_key='country:29123000-0000-4000-8000-000000000041' and edition_id='29123000-0000-4000-8000-000000000022')<>current_setting('test.participation.b')::bigint then raise exception 'Participation CAS escaped source scope'; end if;
 if (select version from public.studio2_jury_window_versions where edition_id='29123000-0000-4000-8000-000000000021')<=current_setting('test.jury.a')::bigint then raise exception 'Jury CAS did not advance'; end if;
 if coalesce((select version from public.studio2_jury_window_versions where edition_id='29123000-0000-4000-8000-000000000022'),0)<>current_setting('test.jury.b')::bigint then raise exception 'Jury CAS escaped source scope'; end if;
 if (select version from public.studio2_confirmation_review_versions where submission_id='29123000-0000-4000-8000-000000000061')<>current_setting('test.review.version')::bigint+1 then raise exception 'Review CAS duplicate or missing touch'; end if;
 if (select count(*) from public.submission_review_history where submission_id='29123000-0000-4000-8000-000000000061')<>1 then raise exception 'Review retry duplicated history'; end if;
end $bounded$;
-- The redundant raw-round guard was retired in favor of the single governed
-- round command and closed DML privileges. Its reattachment is not sanctioned.
do $retired_round_guard$ begin
 if to_regprocedure('private.studio2_guard_direct_confirmation_round_mutation()') is not null then raise exception 'Retired round guard restored'; end if;
 if has_table_privilege('authenticated','public.submission_rounds','INSERT,UPDATE,DELETE,TRUNCATE') then raise exception 'Raw round authority restored'; end if;
end $retired_round_guard$;
-- Entry's retained INVOKER review guard is still independently exercised with
-- scoped hostile ACL/RLS drift. These test-only grants roll back below.
grant select,update on public.internal_entries to authenticated;
create policy v3_test_hostile_internal_review on public.internal_entries for all to authenticated using(true) with check(true);
set local role authenticated;
do $raw$
begin
 begin update public.internal_entries set review_status='accepted' where id='29123000-0000-4000-8000-000000000071'; raise exception 'Raw review accepted'; exception when insufficient_privilege then if position('operation contract' in sqlerrm)=0 then raise; end if; end;
 begin update public.submission_rounds set status='closed' where id='29123000-0000-4000-8000-000000000051'; raise exception 'Raw round mutation accepted'; exception when insufficient_privilege then null; end;
end $raw$;
reset role;

rollback;
