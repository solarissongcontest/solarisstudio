begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.note-recusal-primitive-consolidation', 1, 'forward_fix_only', false, null,
  'Consolidate two redundant Integrity note and recusal physical writers under existing reviewed CAS/idempotency commands'
);

-- The old external wrappers were already retired, and the internal SQL writer
-- implementations have no API-role EXECUTE. Consolidation removes duplicate
-- owners, rather than relocating them just to evade S16 discovery. Preserve
-- all update/event ordering, revisions and history triggers.
do $guard$
declare v_command text; v_impl text; v_call text; v_oid oid; v_def text; v_role text;
begin
  for v_command, v_impl, v_call in
    select * from (values
      ('public.studio2_integrity_recuse_case_reviewer(uuid,text,uuid,text,bigint)',
       'public.admin_recuse_from_integrity_case_impl(uuid,text)',
       'admin_recuse_from_integrity_case_impl('),
      ('public.studio2_integrity_add_case_note(uuid,text,uuid,text,bigint)',
       'public.admin_add_integrity_case_note_impl(uuid,text)',
       'admin_add_integrity_case_note_impl(')
    ) reviewed(command_identity, impl_identity, old_call)
  loop
    v_oid := to_regprocedure(v_command);
    if v_oid is null or to_regprocedure(v_impl) is null then
      raise exception 'P04 note/recusal governing command or implementation absent: % %',v_command,v_impl
      using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
    where p.oid = v_oid and pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef;
    if v_def is null or strpos(v_def,v_call) = 0
       or strpos(v_def,'private.studio2_claim_operation(') = 0
       or strpos(v_def,'private.studio2_complete_operation(') = 0
       or strpos(v_def,'PT409') = 0 then
      raise exception 'P04 note/recusal owner/CAS drift: %',v_command using errcode='55000';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,to_regprocedure(v_impl),'EXECUTE') then
        raise exception 'Internal write primitive % directly callable by %',v_impl,v_role
        using errcode='55000';
      end if;
    end loop;
  end loop;
end $guard$;

create or replace function public.studio2_integrity_recuse_case_reviewer(
  p_case_id uuid,
  p_reason text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'Provide a short recusal reason' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.recuse_reviewer', 'R3',
    jsonb_build_object('caseId', p_case_id, 'reason', btrim(p_reason), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.recuse_reviewer', true);
  perform set_config('app.integrity_rationale', btrim(p_reason), true);
  -- Exactly the original recusal effects, now owned by this reviewed command.
  update public.integrity_case_reviewers
  set recused_at = now(), recusal_reason = btrim(coalesce(p_reason, ''))
  where case_id = p_case_id and user_id = auth.uid() and recused_at is null;
  update public.integrity_cases
  set assigned_to = null, updated_at = now()
  where id = p_case_id and assigned_to = auth.uid();
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (p_case_id, 'reviewer.recused', 'Reviewer recused due to a recorded conflict of interest', false, auth.uid());
  v_inner := jsonb_build_object('ok', true);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

create or replace function public.studio2_integrity_add_case_note(
  p_case_id uuid,
  p_body text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.add_note', 'R2',
    jsonb_build_object('caseId', p_case_id, 'body', btrim(coalesce(p_body, '')), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.add_note', true);
  -- Preserve mature validation and exactly the old notes/events/write order.
  if char_length(btrim(coalesce(p_body, ''))) < 2
     or char_length(btrim(coalesce(p_body, ''))) > 8000 then
    raise exception 'Note must be between 2 and 8000 characters';
  end if;
  insert into public.integrity_case_internal_notes(case_id, body, created_by)
  values (p_case_id, btrim(coalesce(p_body, '')), auth.uid());
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (p_case_id, 'internal.note', 'Internal investigator note added', false, auth.uid());
  update public.integrity_cases set updated_at = now() where id = p_case_id;
  v_inner := jsonb_build_object('ok', true);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

-- RESTRICT fails rather than destroying an unknown SQL dependent.
drop function public.admin_recuse_from_integrity_case_impl(uuid,text) restrict;
drop function public.admin_add_integrity_case_note_impl(uuid,text) restrict;

do $postflight$
begin
  if to_regprocedure('public.admin_recuse_from_integrity_case_impl(uuid,text)') is not null
     or to_regprocedure('public.admin_add_integrity_case_note_impl(uuid,text)') is not null
     or pg_get_functiondef(to_regprocedure('public.studio2_integrity_recuse_case_reviewer(uuid,text,uuid,text,bigint)')) like '%admin_recuse_from_integrity_case_impl(%'
     or pg_get_functiondef(to_regprocedure('public.studio2_integrity_add_case_note(uuid,text,uuid,text,bigint)')) like '%admin_add_integrity_case_note_impl(%'
  then raise exception 'P04 duplicated note/recusal writer still installed' using errcode='55000'; end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
