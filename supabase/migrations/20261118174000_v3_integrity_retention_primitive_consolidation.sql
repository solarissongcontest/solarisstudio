begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.retention-primitive-consolidation', 1, 'forward_fix_only', false, null,
  'Eliminate redundant evidence-retention implementation and retain all effects inside the reviewed CAS and receipt-owning command'
);

do $guard$
declare v_command oid; v_impl oid; v_def text; v_role text;
begin
  v_command := to_regprocedure('public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)');
  v_impl := to_regprocedure('public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text)');
  if v_command is null or v_impl is null then
    raise exception 'P04 retention command or internal implementation missing' using errcode='55000';
  end if;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.oid=v_command and pg_get_userbyid(p.proowner)='postgres' and p.prosecdef;
  if v_def is null or strpos(v_def,'admin_set_integrity_case_retention_impl(')=0
     or strpos(v_def,'private.studio2_claim_operation(')=0
     or strpos(v_def,'private.studio2_complete_operation(')=0
     or strpos(v_def,'PT409')=0 then
    raise exception 'P04 retention CAS/receipt authority drift' using errcode='55000';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,v_impl,'EXECUTE') then
      raise exception 'P04 internal retention writer executable by %',v_role using errcode='55000';
    end if;
  end loop;
end $guard$;

create or replace function public.studio2_integrity_set_case_retention(
  p_case_id uuid,
  p_retention_until timestamptz,
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
  if char_length(btrim(coalesce(p_reason, ''))) < 10 then raise exception 'Retention reason must be at least 10 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.retention', 'R3',
    jsonb_build_object('caseId', p_case_id, 'retentionUntil', p_retention_until, 'reason', btrim(p_reason), 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.retention', true);
  perform set_config('app.integrity_rationale', btrim(p_reason), true);
  if p_retention_until is null or p_retention_until <= now() then
    raise exception 'Retention date must be in the future';
  end if;
  if char_length(btrim(coalesce(p_reason, ''))) > 4000 then
    raise exception 'Retention reason must be between 10 and 4000 characters';
  end if;
  update public.integrity_cases set retention_until = p_retention_until, updated_at = now()
  where id = p_case_id;
  update public.integrity_case_evidence set retention_until = p_retention_until
  where case_id = p_case_id and lifecycle_status = 'active';
  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (p_case_id, 'retention.updated',
    'Evidence retention scheduled until ' || p_retention_until::text || ': ' || btrim(coalesce(p_reason, '')),
    false, auth.uid());
  v_inner := jsonb_build_object('ok', true, 'case_id', p_case_id, 'retention_until', p_retention_until);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

-- Preserve evidence state and historical triggers. An unexpected dependent
-- SQL object must stop the migration, never be removed with CASCADE.
drop function public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text) restrict;

do $postflight$
begin
  if to_regprocedure('public.admin_set_integrity_case_retention_impl(uuid,timestamptz,text)') is not null
     or pg_get_functiondef(to_regprocedure('public.studio2_integrity_set_case_retention(uuid,timestamptz,text,uuid,text,bigint)')) like '%admin_set_integrity_case_retention_impl(%'
  then
    raise exception 'Duplicate Integrity retention writer survived consolidation' using errcode='55000';
  end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
