begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('28120000-0000-4000-8000-000000000001','authenticated','authenticated','relation-owner@local.invalid',now(),now()),
 ('28120000-0000-4000-8000-000000000002','authenticated','authenticated','relation-foreign@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('28120000-0000-4000-8000-000000000011','28120000-0000-4000-8000-000000000001',now(),now()),
 ('28120000-0000-4000-8000-000000000012','28120000-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key,edition_id) values ('28120000-0000-4000-8000-000000000001','organizer',null);
insert into public.integrity_cases(id,public_code,category,summary,details) values
 ('28120000-0000-4000-8000-000000000021','RELATION-A','conduct','Relation A','Relation authority fixture A'),
 ('28120000-0000-4000-8000-000000000022','RELATION-B','conduct','Relation B','Relation authority fixture B');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28120000-0000-4000-8000-000000000001","session_id":"28120000-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $command$
declare v_first jsonb; v_retry jsonb;
begin
 v_first:=public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','corroborating','Reviewed relation',1,null,null,'28120000-0000-4000-8000-000000000101','relation:first');
 v_retry:=public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','corroborating','Reviewed relation',1,null,null,'28120000-0000-4000-8000-000000000101','relation:first');
 if v_first is distinct from v_retry then raise exception 'Relation receipt replay diverged'; end if;
 begin
  perform public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','corroborating','Changed payload',1,null,null,'28120000-0000-4000-8000-000000000101','relation:first');
  raise exception 'Changed relation operation accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','corroborating','Competing note',1,null,null,'28120000-0000-4000-8000-000000000102','relation:stale');
  raise exception 'Stale relation overwrote canonical note';
 exception when serialization_failure then null; end;
 begin
  perform public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','related','Stale case',99,null,null,'28120000-0000-4000-8000-000000000103','relation:case-stale');
  raise exception 'Stale case revision accepted';
 exception when serialization_failure then null; end;
end
$command$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28120000-0000-4000-8000-000000000002","session_id":"28120000-0000-4000-8000-000000000012"}',true);
do $foreign$
begin
 begin
  perform public.studio2_integrity_link_cases('28120000-0000-4000-8000-000000000021','28120000-0000-4000-8000-000000000022','related','Foreign actor',1,null,null,'28120000-0000-4000-8000-000000000104','relation:foreign');
  raise exception 'Foreign actor linked cases';
 exception when insufficient_privilege then null; end;
end
$foreign$;
reset role;
do $audit$
declare v_role text; v_priv text;
begin
 if to_regprocedure('public.admin_link_integrity_cases(uuid,uuid,text,text)') is not null then raise exception 'Legacy relation peer writer remains'; end if;
 if (select count(*) from public.integrity_case_relations where case_id='28120000-0000-4000-8000-000000000021')<>1 then raise exception 'Relation duplicated'; end if;
 if (select count(*) from public.integrity_case_events where operation_id='28120000-0000-4000-8000-000000000101' and event_type='case.linked' and event_metadata->'next'->>'note'='Reviewed relation' and event_metadata->'previous'='null'::jsonb)<>1 then raise exception 'Relation provenance missing or duplicated'; end if;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
   if has_table_privilege(v_role,'public.integrity_case_relations',v_priv) then raise exception 'Raw relation DML remains'; end if;
  end loop;
 end loop;
 if has_function_privilege('service_role','public.studio2_integrity_link_cases(uuid,uuid,text,text,bigint,uuid,text,uuid,text)','EXECUTE') then raise exception 'Service relation command exposed'; end if;
end
$audit$;
set local role service_role;
do $denied$
begin
 begin
  update public.integrity_case_relations set note='Forged';
  raise exception 'Raw service relation note overwrite accepted';
 exception when insufficient_privilege then null; end;
end
$denied$;
rollback;
