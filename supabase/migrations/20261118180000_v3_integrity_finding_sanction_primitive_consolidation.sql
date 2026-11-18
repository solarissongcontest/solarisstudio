begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.finding-sanction-primitive-consolidation',1,'forward_fix_only',false,null,
  'Consolidate redundant finding/sanction physical writers into the existing CAS+receipt authority while preserving rule links, appeal provenance, case events and Archive'
);

do $guard$
declare v_command text; v_impl text; v_call text; v_def text; v_oid oid; v_role text;
begin
  for v_command,v_impl,v_call in
    select * from (values
      ('public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)',
       'public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean)',
       'admin_record_integrity_finding_impl('),
      ('public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)',
       'public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)',
       'admin_record_integrity_sanction_impl(')
    ) expected(command,implementation,call)
  loop
    v_oid := to_regprocedure(v_command);
    if v_oid is null or to_regprocedure(v_impl) is null then
      raise exception 'Missing canonical command or sanctioned implementation %, %',v_command,v_impl using errcode='55000';
    end if;
    select pg_get_functiondef(p.oid) into v_def from pg_proc p
      where p.oid=v_oid and p.prosecdef and pg_get_userbyid(p.proowner)='postgres';
    if v_def is null or strpos(v_def,v_call)=0 or strpos(v_def,'PT409')=0
      or strpos(v_def,'private.studio2_claim_operation(')=0
      or strpos(v_def,'private.studio2_complete_operation(')=0 then
      raise exception 'Unexpected canonical finding/sanction command contract: %',v_command using errcode='55000';
    end if;
    foreach v_role in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(v_role,to_regprocedure(v_impl),'EXECUTE') then
        raise exception 'Competing internal Integrity writer exposed to role %: %',v_role,v_impl using errcode='55000';
      end if;
    end loop;
  end loop;
end $guard$;

create or replace function public.studio2_integrity_record_finding(
  p_case_id uuid,
  p_outcome text,
  p_summary text,
  p_rationale text,
  p_rule_ids text[],
  p_visible_to_reporter boolean,
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
  v_inner jsonb;
  v_result jsonb;
  v_finding_id uuid;
  v_rule text;
  v_relevance text;
  v_status text;
  v_summary text;
  v_rationale text;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.finding', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'outcome', p_outcome, 'summary', btrim(coalesce(p_summary, '')),
      'rationale', btrim(coalesce(p_rationale, '')), 'ruleIds', to_jsonb(coalesce(p_rule_ids, '{}'::text[])),
      'visibleToReporter', coalesce(p_visible_to_reporter, true), 'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.finding', true);
  perform set_config('app.integrity_rationale', btrim(coalesce(p_rationale, '')), true);
  -- The original mature finding validation and all physical effects now belong
  -- to this one reviewed, CAS-governed, receipted command.
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if p_outcome not in ('violation','no_violation','insufficient_evidence','outside_jurisdiction','duplicate','administrative_resolution') then
    raise exception 'Invalid outcome';
  end if;
  v_summary := btrim(coalesce(p_summary, ''));
  v_rationale := btrim(coalesce(p_rationale, ''));
  if char_length(v_summary) < 5 or char_length(v_summary) > 240 then
    raise exception 'Finding summary must be between 5 and 240 characters';
  end if;
  if char_length(v_rationale) < 20 or char_length(v_rationale) > 12000 then
    raise exception 'Finding rationale must be between 20 and 12000 characters';
  end if;
  foreach v_rule in array coalesce(p_rule_ids, '{}'::text[]) loop
    if btrim(v_rule) !~ '^[0-9]+[.][0-9]+$' then raise exception 'Invalid SSC rule id: %', v_rule; end if;
  end loop;

  insert into public.integrity_case_findings(case_id,outcome,summary,rationale,rule_ids,visible_to_reporter,created_by)
  values (p_case_id,p_outcome,v_summary,v_rationale,coalesce(p_rule_ids, '{}'::text[]),coalesce(p_visible_to_reporter,true),auth.uid())
  returning id into v_finding_id;

  v_relevance := case when p_outcome = 'violation' then 'supported'
    when p_outcome = 'no_violation' then 'not_supported' else 'reviewed' end;
  foreach v_rule in array coalesce(p_rule_ids, '{}'::text[]) loop
    insert into public.integrity_case_rule_links(case_id,rule_id,relevance,added_by)
    values (p_case_id,btrim(v_rule),v_relevance,auth.uid())
    on conflict (case_id,rule_id) do update
      set relevance=excluded.relevance, added_by=excluded.added_by, updated_at=now();
  end loop;

  v_status := case p_outcome
    when 'violation' then 'action_taken'
    when 'no_violation' then 'closed_no_violation'
    when 'insufficient_evidence' then 'closed_insufficient_evidence'
    when 'outside_jurisdiction' then 'closed_outside_jurisdiction'
    when 'duplicate' then 'closed_duplicate'
    else 'closed' end;
  update public.integrity_cases
  set status=v_status, updated_at=now(),
      closed_at=case when v_status like 'closed%' then coalesce(closed_at,now()) else null end
  where id=p_case_id;
  insert into public.integrity_case_events(case_id,event_type,detail,visible_to_reporter,actor_user_id)
  values (p_case_id,'finding.recorded',v_summary,coalesce(p_visible_to_reporter,true),auth.uid());
  v_inner := jsonb_build_object('ok',true,'finding_id',v_finding_id,'status',v_status);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_record_sanction(
  p_case_id uuid,
  p_finding_id uuid,
  p_typical_level integer,
  p_final_level integer,
  p_target_type text,
  p_target_reference text,
  p_aggravating_factors text[],
  p_mitigating_factors text[],
  p_rationale text,
  p_visible_to_reporter boolean,
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
  v_inner jsonb;
  v_result jsonb;
  v_sanction_id uuid;
  v_label text;
  v_outcome text;
  v_rationale text;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected case version are required' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.sanction', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'findingId', p_finding_id, 'typicalLevel', p_typical_level,
      'finalLevel', p_final_level, 'targetType', p_target_type, 'targetReference', nullif(btrim(coalesce(p_target_reference, '')), ''),
      'aggravatingFactors', to_jsonb(coalesce(p_aggravating_factors, '{}'::text[])),
      'mitigatingFactors', to_jsonb(coalesce(p_mitigating_factors, '{}'::text[])),
      'rationale', btrim(coalesce(p_rationale, '')), 'visibleToReporter', coalesce(p_visible_to_reporter, true),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.sanction', true);
  perform set_config('app.integrity_rationale', btrim(coalesce(p_rationale, '')), true);
  -- Keep the previous sanction eligibility, level, reason and audit semantics.
  if not public.integrity_is_organizer() then raise exception 'Organizer access required'; end if;
  if p_final_level not between 1 and 10 then raise exception 'Final sanction level must be between 1 and 10'; end if;
  if p_typical_level is not null and p_typical_level not between 1 and 10 then
    raise exception 'Typical sanction level must be between 1 and 10';
  end if;
  if p_target_type not in ('participant','delegation','ballot','entry','account','other') then
    raise exception 'Invalid sanction target type';
  end if;
  v_rationale := btrim(coalesce(p_rationale, ''));
  if char_length(v_rationale) < 20 or char_length(v_rationale) > 12000 then
    raise exception 'Sanction rationale must be between 20 and 12000 characters';
  end if;
  select outcome into v_outcome from public.integrity_case_findings
  where id=p_finding_id and case_id=p_case_id;
  if v_outcome is null then raise exception 'Finding does not belong to this case'; end if;
  if v_outcome <> 'violation' then raise exception 'A sanction requires a confirmed violation finding'; end if;

  v_label := public.integrity_sanction_label(p_final_level);
  insert into public.integrity_case_sanctions(
    case_id,finding_id,typical_level,final_level,sanction_label,target_type,target_reference,
    aggravating_factors,mitigating_factors,rationale,visible_to_reporter,created_by
  ) values (
    p_case_id,p_finding_id,p_typical_level,p_final_level,v_label,
    p_target_type,nullif(btrim(coalesce(p_target_reference,'')),''),
    coalesce(p_aggravating_factors,'{}'::text[]),coalesce(p_mitigating_factors,'{}'::text[]),
    v_rationale,coalesce(p_visible_to_reporter,true),auth.uid()
  ) returning id into v_sanction_id;
  update public.integrity_cases set status='action_taken',updated_at=now(),closed_at=null where id=p_case_id;
  insert into public.integrity_case_events(case_id,event_type,detail,visible_to_reporter,actor_user_id)
  values (p_case_id,'sanction.recorded',
          'Level ' || p_final_level || ' sanction recorded: ' || v_label,
          coalesce(p_visible_to_reporter,true),auth.uid());
  v_inner := jsonb_build_object('ok',true,'sanction_id',v_sanction_id,'level',p_final_level,'label',v_label);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

-- RESTRICT ensures an unknown downstream SQL dependent blocks adoption.
drop function public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean) restrict;
drop function public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean) restrict;

do $postflight$
begin
  if to_regprocedure('public.admin_record_integrity_finding_impl(uuid,text,text,text,text[],boolean)') is not null
    or to_regprocedure('public.admin_record_integrity_sanction_impl(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean)') is not null
    or pg_get_functiondef(to_regprocedure('public.studio2_integrity_record_finding(uuid,text,text,text,text[],boolean,uuid,text,bigint)')) like '%admin_record_integrity_finding_impl(%'
    or pg_get_functiondef(to_regprocedure('public.studio2_integrity_record_sanction(uuid,uuid,integer,integer,text,text,text[],text[],text,boolean,uuid,text,bigint)')) like '%admin_record_integrity_sanction_impl(%'
  then raise exception 'P04 finding/sanction duplicate writer remains' using errcode='55000'; end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
