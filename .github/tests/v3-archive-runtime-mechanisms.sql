\set ON_ERROR_STOP on
begin;
-- CONTRACTS
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
insert into auth.users(id,aud,role,email) values('29115000-0000-4000-8000-000000000001','authenticated','authenticated','archive-runtime@local.invalid');
insert into auth.sessions(id,user_id,created_at,updated_at) values('29115000-0000-4000-8000-000000000011','29115000-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key) values('29115000-0000-4000-8000-000000000001','organizer');
insert into public.editions(id,name,slug,edition_number,status) values
 ('29115000-0000-4000-8000-000000000021','Archive mechanisms','archive-mechanisms-29115000',29115000,'active'),
 ('29115000-0000-4000-8000-000000000022','Binding mechanisms','binding-mechanisms-29115000',29115001,'active');
-- Seed a valid pre-Archive fixture. Only the canonical command below may cross
-- the Archive boundary; no setting, owner DML or direct primitive may do so.
update public.studio2_edition_runtime set state='post_edition',subsystems=private.studio2_default_subsystems('post_edition'),version=3 where edition_id='29115000-0000-4000-8000-000000000021';
do $direct$
begin
 begin
  perform set_config('solaris.v3_archive_command','allowed',true);
  update public.studio2_edition_runtime set state='archived',subsystems=private.studio2_default_subsystems('archived') where edition_id='29115000-0000-4000-8000-000000000021';
  raise exception 'Caller setting bypassed Archive authority';
 exception when insufficient_privilege then if position('canonical V3 lifecycle command' in sqlerrm)=0 then raise; end if; end;
end $direct$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"29115000-0000-4000-8000-000000000001","session_id":"29115000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $canonical$
declare result jsonb; replay jsonb;
begin
 begin
  perform public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','archived',null,null,2,'29115000-0000-4000-8000-000000000101','archive:stale');
  raise exception 'Stale Archive accepted';
 exception when sqlstate 'PT409' then null; end;
 result:=public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','archived',null,null,3,'29115000-0000-4000-8000-000000000102','archive:canonical');
 if result->>'state'<>'archived' or (result->>'runtimeVersion')::bigint<>4 then raise exception 'Canonical Archive failed'; end if;
 replay:=public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','archived',null,null,3,'29115000-0000-4000-8000-000000000102','archive:canonical');
 if replay-'replayed'<>result-'replayed' or not (replay->>'replayed')::boolean then raise exception 'Archive response-loss readback failed'; end if;
 begin
  perform public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','post_edition',null,null,4,'29115000-0000-4000-8000-000000000103','archive:reverse');
  raise exception 'Canonical Archive reversal accepted';
 exception when sqlstate 'PT409' then null; end;
end $canonical$;
reset role;
do $freeze$
begin
 if (select status from public.editions where id='29115000-0000-4000-8000-000000000021')<>'completed' then raise exception 'Archive legacy projection missing'; end if;
 if (select count(*) from private.v3_domain_events where operation_id='29115000-0000-4000-8000-000000000102' and event_type='edition.archived')<>1 then raise exception 'Archive consequence duplicated'; end if;
 begin update public.editions set status='active' where id='29115000-0000-4000-8000-000000000021'; raise exception 'Owner reversed legacy Archive'; exception when insufficient_privilege then if sqlerrm<>'Archived edition lifecycle is read-only.' then raise; end if; end;
 begin update public.studio2_edition_runtime set version=version+1 where edition_id='29115000-0000-4000-8000-000000000021'; raise exception 'Owner mutated archived runtime'; exception when insufficient_privilege then if sqlerrm<>'Archived edition runtime is read-only.' then raise; end if; end;
 begin delete from public.studio2_edition_runtime where edition_id='29115000-0000-4000-8000-000000000021'; raise exception 'Owner deleted Archive'; exception when insufficient_privilege then if sqlerrm<>'Archived edition runtime is irreversible.' then raise; end if; end;
end $freeze$;
-- Existing Confirmation binding command remains the sole binding/editing
-- authority for its semantic request and owns both version and receipt.
select set_config('test.binding.version',(select data_revision::text from public.editions where id='29115000-0000-4000-8000-000000000022'),true);
set local role authenticated;
do $binding$
declare result jsonb; replay jsonb;
begin
 result:=public.studio2_apply_confirmation_edition_binding_change('29115000-0000-4000-8000-000000000022','bind',null,'29115000-0000-4000-8000-000000000111','binding:canonical',current_setting('test.binding.version')::bigint,null);
 replay:=public.studio2_apply_confirmation_edition_binding_change('29115000-0000-4000-8000-000000000022','bind',null,'29115000-0000-4000-8000-000000000111','binding:canonical',current_setting('test.binding.version')::bigint,null);
 if replay->'result' is distinct from result->'result' or not (replay->>'replayed')::boolean then raise exception 'Binding response-loss readback failed'; end if;
 begin
  perform public.studio2_apply_confirmation_edition_binding_change('29115000-0000-4000-8000-000000000022','editing',false,'29115000-0000-4000-8000-000000000112','binding:stale',current_setting('test.binding.version')::bigint,null);
  raise exception 'Stale binding version accepted';
 exception when sqlstate 'PT409' then null; end;
end $binding$;
reset role;
delete from public.studio2_role_assignments where user_id='29115000-0000-4000-8000-000000000001';
set local role authenticated;
do $capability$ begin
 begin perform public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','archived',null,null,3,'29115000-0000-4000-8000-000000000102','archive:canonical'); raise exception 'Missing Archive capability accepted'; exception when insufficient_privilege then null; end;
end $capability$;
reset role;
insert into public.studio2_role_assignments(user_id,role_key) values('29115000-0000-4000-8000-000000000001','organizer');
delete from auth.sessions where id='29115000-0000-4000-8000-000000000011';
set local role authenticated;
do $revoked$ begin
 begin perform public.studio2_transition_edition_v3('29115000-0000-4000-8000-000000000021','archived',null,null,3,'29115000-0000-4000-8000-000000000102','archive:canonical'); raise exception 'Revoked Archive replay accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
 begin perform public.studio2_apply_confirmation_edition_binding_change('29115000-0000-4000-8000-000000000022','bind',null,'29115000-0000-4000-8000-000000000111','binding:canonical',current_setting('test.binding.version')::bigint,null); raise exception 'Revoked binding replay accepted'; exception when insufficient_privilege then if sqlerrm<>'SESSION_REVOKED' then raise; end if; end;
end $revoked$;
reset role;
do $exposure$
declare r text;
begin
 foreach r in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(r,'private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE') then raise exception 'Private lifecycle primitive exposed'; end if;
 end loop;
 if has_function_privilege('service_role','public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE') or has_function_privilege('service_role','public.studio2_apply_confirmation_edition_binding_change(uuid,text,boolean,uuid,text,bigint,uuid)','EXECUTE') then raise exception 'Service role retained semantic authority'; end if;
end $exposure$;
rollback;
