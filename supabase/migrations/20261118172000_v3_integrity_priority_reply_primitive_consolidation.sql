begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.priority-reply-primitive-consolidation', 1, 'forward_fix_only', false, null,
  'Consolidate redundant priority/reply physical Integrity writers into the existing receipt-backed CAS commands without altering history or event effects'
);

-- Both legacy public RPCs were already retired. Consolidating the internal
-- functions below removes two *real* independent SQL write paths. This is not
-- a scanner exception, new alias or an edit to an applied migration.
do $guard$
declare v_command text; v_impl text; v_call text; v_def text; v_oid oid; v_role text;
begin
  for v_command, v_impl, v_call in
    select * from (values
      ('public.studio2_integrity_set_case_priority(uuid,text,uuid,text,bigint)',
       'public.admin_set_integrity_priority_impl(uuid,text)', 'admin_set_integrity_priority_impl('),
      ('public.studio2_integrity_reply_case(uuid,text,boolean,uuid,text,bigint)',
       'public.admin_reply_integrity_case_impl(uuid,text,boolean)', 'admin_reply_integrity_case_impl(')
    ) expected(command, implementation, call)
  loop
    v_oid := to_regprocedure(v_command);
    if v_oid is null or to_regprocedure(v_impl) is null then
      raise exception 'Missing P04 canonical command or implementation: %, %', v_command, v_impl using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      where p.oid = v_oid and pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef;
    if v_def is null or strpos(v_def,v_call) = 0 or strpos(v_def,'PT409') = 0
       or strpos(v_def,'private.studio2_claim_operation(') = 0
       or strpos(v_def,'private.studio2_complete_operation(') = 0 then
      raise exception 'Unexpected P04 priority/reply command source: %', v_command using errcode='55000';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,to_regprocedure(v_impl),'EXECUTE') then
        raise exception 'Internal physical writer directly executable by %: %',v_role,v_impl using errcode='55000';
      end if;
    end loop;
  end loop;
end $guard$;

create or replace function public.studio2_integrity_set_case_priority(
  p_case_id uuid,
  p_priority text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.priority', 'R3',
    jsonb_build_object('caseId', p_case_id, 'priority', p_priority, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.priority', true);
  -- Keep mature priority validation and audit event under the CAS owner.
  if p_priority not in ('information', 'standard', 'high', 'urgent') then
    raise exception 'Invalid priority';
  end if;
  update public.integrity_cases set priority = p_priority, updated_at = now()
  where id = p_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (p_case_id, 'priority.changed', 'Case priority changed to ' || p_priority, false, auth.uid());

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'priority', v_case.priority, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_reply_case(
  p_case_id uuid,
  p_body text,
  p_request_response boolean,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.reply', 'R3',
    jsonb_build_object('caseId', p_case_id, 'body', btrim(coalesce(p_body, '')), 'requestResponse', coalesce(p_request_response, true), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reply', true);
  -- Preserve the old validated write ordering within the canonical command.
  if char_length(btrim(coalesce(p_body, ''))) < 2
     or char_length(btrim(coalesce(p_body, ''))) > 8000 then
    raise exception 'Message must be between 2 and 8000 characters';
  end if;
  insert into public.integrity_case_messages(case_id, author_role, body, created_by)
  values (p_case_id, 'tsbc', btrim(coalesce(p_body, '')), auth.uid());
  if coalesce(p_request_response, true) then
    insert into public.integrity_case_requests(case_id, request_kind, prompt, created_by)
    values (p_case_id, 'clarification', btrim(coalesce(p_body, '')), auth.uid());
  end if;
  update public.integrity_cases
  set status = case when coalesce(p_request_response, true) then 'waiting_for_reporter' else status end, updated_at = now()
  where id = p_case_id;
  insert into public.integrity_case_events(case_id, event_type, detail, actor_user_id)
  values (p_case_id,
    case when coalesce(p_request_response, true) then 'tsbc.question' else 'tsbc.message' end,
    case when coalesce(p_request_response, true) then 'TSBC requested more information' else 'TSBC sent a case update' end,
    auth.uid());

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'status', v_case.status, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

drop function public.admin_set_integrity_priority_impl(uuid,text) restrict;
drop function public.admin_reply_integrity_case_impl(uuid,text,boolean) restrict;

do $postflight$
begin
  if to_regprocedure('public.admin_set_integrity_priority_impl(uuid,text)') is not null
    or to_regprocedure('public.admin_reply_integrity_case_impl(uuid,text,boolean)') is not null
    or pg_get_functiondef(to_regprocedure('public.studio2_integrity_set_case_priority(uuid,text,uuid,text,bigint)')) like '%admin_set_integrity_priority_impl(%'
    or pg_get_functiondef(to_regprocedure('public.studio2_integrity_reply_case(uuid,text,boolean,uuid,text,bigint)')) like '%admin_reply_integrity_case_impl(%'
  then raise exception 'P04 redundant priority/reply physical writer remains' using errcode='55000'; end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
