begin;
insert into auth.users(id,aud,role,email,created_at,updated_at) values
 ('28150032-0000-4000-8000-000000000001','authenticated','authenticated','evidence-command@local.invalid',now(),now()),
 ('28150032-0000-4000-8000-000000000002','authenticated','authenticated','evidence-foreign@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at) values
 ('28150032-0000-4000-8000-000000000011','28150032-0000-4000-8000-000000000001',now(),now()),
 ('28150032-0000-4000-8000-000000000012','28150032-0000-4000-8000-000000000002',now(),now());
insert into public.studio2_role_assignments(user_id,role_key,edition_id) values ('28150032-0000-4000-8000-000000000001','organizer',null);
insert into public.integrity_cases(id,public_code,category,summary,details) values
 ('28150032-0000-4000-8000-000000000021','EVIDENCE-COMMAND','conduct','Evidence command','Evidence registration authority fixture');
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28150032-0000-4000-8000-000000000001","session_id":"28150032-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $command$
declare v_first jsonb; v_retry jsonb;
begin
 v_first:=public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','statement','Original title','Immutable evidence statement',null,false,1,'28150032-0000-4000-8000-000000000101','evidence:register');
 v_retry:=public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','statement','Original title','Immutable evidence statement',null,false,1,'28150032-0000-4000-8000-000000000101','evidence:register');
 if v_first is distinct from v_retry or v_first->>'evidence_id' is null then raise exception 'Evidence lost-response recovery diverged'; end if;
 begin
  perform public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','statement','Changed title','Immutable evidence statement',null,false,1,'28150032-0000-4000-8000-000000000101','evidence:register');
  raise exception 'Evidence request conflict accepted';
 exception when raise_exception then if sqlerrm<>'IDEMPOTENCY_CONFLICT' then raise; end if; end;
 begin
  perform public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','text','Stale review',null,null,false,99,'28150032-0000-4000-8000-000000000102','evidence:stale');
  raise exception 'Stale case evidence accepted';
 exception when serialization_failure then null; end;
 begin
  perform public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000099','text','Unknown case',null,null,false,1,'28150032-0000-4000-8000-000000000103','evidence:unknown');
  raise exception 'Foreign or missing case evidence accepted';
 exception when no_data_found then null; end;
end
$command$;
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28150032-0000-4000-8000-000000000002","session_id":"28150032-0000-4000-8000-000000000012"}',true);
do $foreign$
begin
 begin
  perform public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','text','Unauthorized',null,null,false,1,'28150032-0000-4000-8000-000000000104','evidence:foreign');
  raise exception 'Unauthorized reporter registered Organizer evidence';
 exception when insufficient_privilege then null; end;
end
$foreign$;
reset role;
delete from auth.sessions where id='28150032-0000-4000-8000-000000000011';
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28150032-0000-4000-8000-000000000001","session_id":"28150032-0000-4000-8000-000000000011"}',true);
set local role authenticated;
do $revoked$
begin
 begin
  perform public.studio2_integrity_register_evidence('28150032-0000-4000-8000-000000000021','statement','Original title','Immutable evidence statement',null,false,1,'28150032-0000-4000-8000-000000000101','evidence:register');
  raise exception 'Revoked session replayed evidence receipt';
 exception when insufficient_privilege then null; end;
end
$revoked$;
reset role;
do $audit$
declare v_role text;
begin
 if to_regprocedure('public.admin_register_integrity_evidence(uuid,text,text,text,text,boolean)') is not null then raise exception 'Legacy evidence peer remains'; end if;
 if (select count(*) from public.integrity_case_evidence where case_id='28150032-0000-4000-8000-000000000021')<>1 then raise exception 'Evidence duplicate or unauthorized insert'; end if;
 if (select count(*) from public.integrity_case_events where operation_id='28150032-0000-4000-8000-000000000101' and event_type='evidence.added' and actor_user_id='28150032-0000-4000-8000-000000000001')<>1 then raise exception 'Evidence provenance missing or duplicated'; end if;
 if not exists(select 1 from public.studio2_operation_receipts where operation_id='28150032-0000-4000-8000-000000000101' and status='succeeded') then raise exception 'Evidence receipt missing'; end if;
 foreach v_role in array array['anon','service_role'] loop
  if has_function_privilege(v_role,'public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text)','EXECUTE') then raise exception 'Unexpected evidence command EXECUTE'; end if;
 end loop;
 if not exists(select 1 from pg_proc where oid='public.studio2_integrity_register_evidence(uuid,text,text,text,text,boolean,bigint,uuid,text)'::regprocedure and prosecdef and proowner='postgres'::regrole and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then raise exception 'Unsafe evidence command owner/path'; end if;
end
$audit$;
rollback;
