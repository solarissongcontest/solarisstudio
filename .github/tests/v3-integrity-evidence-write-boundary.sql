begin;
insert into auth.users(id,aud,role,email,created_at,updated_at)
values ('28111146-0000-4000-8000-000000000001','authenticated','authenticated','evidence-boundary@local.invalid',now(),now());
insert into auth.sessions(id,user_id,created_at,updated_at)
values ('28111146-0000-4000-8000-000000000011','28111146-0000-4000-8000-000000000001',now(),now());
insert into public.studio2_role_assignments(user_id,role_key,edition_id)
values ('28111146-0000-4000-8000-000000000001','organizer',null);
insert into public.integrity_cases(id,public_code,category,summary,details,retention_until,identity_mode,reporter_user_id)
values
 ('28111146-0000-4000-8000-000000000021','EVIDENCE-BOUNDARY-A','conduct','Boundary fixture A','Evidence boundary fixture details',now()+interval '1 year','confidential','28111146-0000-4000-8000-000000000001'),
 ('28111146-0000-4000-8000-000000000022','EVIDENCE-BOUNDARY-B','conduct','Boundary fixture B','Evidence boundary fixture details',now()+interval '2 years','anonymous',null);
select set_config('request.jwt.claims','{"role":"authenticated","sub":"28111146-0000-4000-8000-000000000001","session_id":"28111146-0000-4000-8000-000000000011"}',true);
set local role authenticated;
select public.admin_register_integrity_evidence('28111146-0000-4000-8000-000000000021','text','Governed evidence fixture','A concrete statement',null,false);
reset role;
do $invariants$
declare
  v_source uuid;
  v_role text;
  v_function text;
begin
  select id into strict v_source from public.integrity_case_evidence where case_id='28111146-0000-4000-8000-000000000021';
  if (select e.retention_until is distinct from c.retention_until from public.integrity_case_evidence e join public.integrity_cases c on c.id=e.case_id where e.id=v_source) then
    raise exception 'Evidence retention failed to inherit canonical case policy';
  end if;
  begin
    insert into public.integrity_case_evidence(case_id,source_role,evidence_type,title,redacted_from_id)
    values ('28111146-0000-4000-8000-000000000022','tsbc','text','Foreign redaction',v_source);
    raise exception 'Foreign lineage was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Redaction source must belong to the same case' then raise; end if;
  end;
  foreach v_function in array array[
    'public.integrity_finalize_evidence_token(uuid,uuid,uuid)',
    'public.integrity_apply_case_retention_to_evidence()',
    'public.integrity_validate_evidence_lineage()'
  ] loop
    if not exists(select 1 from pg_proc where oid=v_function::regprocedure and proowner='postgres'::regrole and prosecdef and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then
      raise exception 'Unsafe internal evidence function: %',v_function;
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,v_function,'EXECUTE') then raise exception 'Callable internal evidence primitive: % %',v_role,v_function; end if;
    end loop;
  end loop;
  if (select count(*) from pg_trigger where tgrelid='public.integrity_case_evidence'::regclass and not tgisinternal and
       ((tgname='integrity_evidence_inherit_case_retention' and tgfoid='public.integrity_apply_case_retention_to_evidence()'::regprocedure and tgtype=7)
        or (tgname='integrity_evidence_validate_lineage' and tgfoid='public.integrity_validate_evidence_lineage()'::regprocedure and tgtype=23))) <> 2 then
    raise exception 'Evidence invariant trigger attachment changed';
  end if;
end
$invariants$;
set local role service_role;
do $denials$
begin
  begin
    truncate public.integrity_case_evidence;
    raise exception 'Raw service evidence TRUNCATE accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.integrity_case_evidence set title='Raw bypass' where case_id='28111146-0000-4000-8000-000000000021';
    raise exception 'Raw service evidence UPDATE accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.integrity_finalize_evidence_token('28111146-0000-4000-8000-000000000099','28111146-0000-4000-8000-000000000021','28111146-0000-4000-8000-000000000001');
    raise exception 'Service actor forgery primitive accepted';
  exception when insufficient_privilege then null;
  end;
end
$denials$;
reset role;
insert into public.integrity_evidence_upload_tokens(id,case_id,object_path,original_name,mime_type,expected_size,created_by)
values ('28111146-0000-4000-8000-000000000031','28111146-0000-4000-8000-000000000021','case/28111146-0000-4000-8000-000000000021/reporter/boundary.txt','boundary.txt','text/plain',5,'28111146-0000-4000-8000-000000000001');
insert into storage.objects(bucket_id,name,metadata)
values ('integrity-evidence','case/28111146-0000-4000-8000-000000000021/reporter/boundary.txt','{"size":5,"mimetype":"text/plain"}');
set local role authenticated;
select public.finalize_protected_evidence('28111146-0000-4000-8000-000000000021','28111146-0000-4000-8000-000000000031');
reset role;
do $receipt$
begin
  if (select count(*) from public.integrity_case_evidence where original_name='boundary.txt') <> 1
    or (select used_at from public.integrity_evidence_upload_tokens where id='28111146-0000-4000-8000-000000000031') is null then
    raise exception 'Governed reporter wrapper failed after internal primitive revoke';
  end if;
end
$receipt$;
rollback;
