\set ON_ERROR_STOP on
begin;
-- CONTRACTS
-- Catalog assertions are generated from the reviewed contracts, then evaluated
-- against live PostgreSQL. There is no cached passed/sanctioned flag.
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
insert into auth.users(id,aud,role,email) values('29043157-0000-4000-8000-000000000001','authenticated','authenticated','combined@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29043157-0000-4000-8000-000000000011','29043157-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29043157-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values('29043157-0000-4000-8000-000000000021','Combined proof','combined-proof-29043157',29043157,'active');
insert into public.shows(id,edition_id,name,kind,sort_order) values('29043157-0000-4000-8000-000000000031','29043157-0000-4000-8000-000000000021','Combined proof','special',1);
insert into public.countries(id,name,short_code) values('29043157-0000-4000-8000-000000000041','Combined country','QX');
insert into public.participants(edition_id,show_id,country_id,running_order) values('29043157-0000-4000-8000-000000000021','29043157-0000-4000-8000-000000000031','29043157-0000-4000-8000-000000000041',1);
insert into televoting.editions(id,name) values('29043157-0000-4000-8000-000000000051','Combined proof');
insert into televoting.rounds(id,edition_id,name) values('29043157-0000-4000-8000-000000000061','29043157-0000-4000-8000-000000000051','Combined round');
insert into public.televoting_round_bindings(remote_round_id,remote_edition_id,edition_id,show_id) values('29043157-0000-4000-8000-000000000061','29043157-0000-4000-8000-000000000051','29043157-0000-4000-8000-000000000021','29043157-0000-4000-8000-000000000031');
insert into televoting.televote_aggregations(id,name,updated_at,calculation_version) values('29043157-0000-4000-8000-000000000071','Combined authority','2026-10-29T00:00:00Z',1);
insert into televoting.televote_aggregation_sources(aggregation_id,source_round_id,source_name) values('29043157-0000-4000-8000-000000000071','29043157-0000-4000-8000-000000000061','Canonical source');

insert into televoting.countries(code,name) values('QA','Mechanism A'),('QB','Mechanism B') on conflict do nothing;
select set_config('test.round.version',(select version::text from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061'),true);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29043157-0000-4000-8000-000000000001","session_id":"29043157-0000-4000-8000-000000000011"}',true);
set local role authenticated;
-- Canonical command -> explicit identity -> normalization/version/metadata.
select televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','save_custom','{"customName":"Governed identity"}',current_setting('test.round.version')::bigint,'29043157-0000-4000-8000-000000000901','mechanism:custom');
reset role;
do $behavior$
declare v bigint; entry_id uuid; old_key text;
begin
 select id,entry_key into entry_id,old_key from televoting.round_entries where round_id='29043157-0000-4000-8000-000000000061' and entry_type='custom';
 if old_key is null or old_key not like 'x_%' then raise exception 'Canonical custom identity missing'; end if;
 begin
  insert into televoting.round_entries(round_id,entry_type,custom_name) values('29043157-0000-4000-8000-000000000061','custom','Trigger cannot invent identity');
  raise exception 'Trigger still creates business identity';
 exception when check_violation then null; end;
 update televoting.round_entries set entry_key='forged-identity',custom_name='Renamed' where id=entry_id;
 if (select entry_key from televoting.round_entries where id=entry_id)<>old_key then raise exception 'Custom identity drifted'; end if;
 -- Timestamp and revision touches are bounded to the owning round.
 if (select version from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061')<=current_setting('test.round.version')::bigint then raise exception 'Revision did not advance'; end if;
 select version into v from public.studio2_televote_round_versions where round_id='29043157-0000-4000-8000-000000000061';
 perform televoting.v3_configure_round('29043157-0000-4000-8000-000000000061','replace_countries','{"countryCodes":["QA","QB"]}',v,'29043157-0000-4000-8000-000000000902','mechanism:countries');
 if (select array_agg(country_code order by display_order) from televoting.round_countries where round_id='29043157-0000-4000-8000-000000000061') is distinct from array['QA','QB'] then raise exception 'Membership projection drifted'; end if;
end $behavior$;
-- The guard rejects an actual late ballot, without replacing its canonical
-- identity or recording a business decision.
update televoting.rounds set closes_at=now()-interval '1 hour' where id='29043157-0000-4000-8000-000000000061';
do $deadline$ begin
 begin
  insert into televoting.vote_submissions(round_id,username,username_normalized,country_code) values('29043157-0000-4000-8000-000000000061','Late voter','late voter','QA');
  raise exception 'Deadline guard accepted late ballot';
 exception when invalid_parameter_value then if sqlerrm<>'Voting deadline has passed' then raise; end if; end;
end $deadline$;
update televoting.rounds set closes_at=now()+interval '1 hour' where id='29043157-0000-4000-8000-000000000061';
insert into televoting.voter_sanctions(scope_type,username_normalized,sanction_type,reason) values('username','blocked voter','permanent','Mechanism proof');
do $sanction$ begin
 begin
  insert into televoting.vote_submissions(round_id,username,username_normalized,country_code) values('29043157-0000-4000-8000-000000000061','Blocked voter','blocked voter','QA');
  raise exception 'Sanction guard accepted ballot';
 exception when insufficient_privilege then null; end;
end $sanction$;
-- Scope guard rejects a ballot entry outside the source round, atomically.
insert into televoting.vote_submissions(id,round_id,username,username_normalized,country_code) values('29043157-0000-4000-8000-000000000911','29043157-0000-4000-8000-000000000061','Scope voter','scope voter','QA');
do $scope$ begin
 begin
  insert into televoting.vote_entries(submission_id,target_country_code,points) values('29043157-0000-4000-8000-000000000911','OUTSIDE',10);
  raise exception 'Scope guard accepted wrong entry';
 exception when check_violation then null; end;
end $scope$;
-- Hostile grant drift is scoped to this rolled-back fixture. Even if a grant
-- is accidentally restored, the invoker guards reject raw lifecycle changes.
grant update on televoting.rounds to authenticated;
set local role authenticated;
do $direct$ begin
 begin update televoting.rounds set status='closed' where id='29043157-0000-4000-8000-000000000061'; raise exception 'Direct status accepted'; exception when insufficient_privilege then if position('operation contract' in sqlerrm)=0 then raise; end if; end;
 begin update televoting.rounds set closes_at=now()+interval '2 hours' where id='29043157-0000-4000-8000-000000000061'; raise exception 'Direct deadline accepted'; exception when insufficient_privilege then if position('deadline operation contract' in sqlerrm)=0 then raise; end if; end;
end $direct$;
reset role;
revoke update on televoting.rounds from authenticated;
delete from auth.sessions where id='29043157-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$ begin
 begin perform televoting.organizer_record_integrity_decision('29043157-0000-4000-8000-000000000911','cleared','Reason proof',null); raise exception 'Revoked moderation actor accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
rollback;
