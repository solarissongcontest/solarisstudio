begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

select public.v3_register_migration_contract(
  'v3.integrity.preclearance-primitive-consolidation', 1, 'forward_fix_only', false, null,
  'Retain private pre-clearance ruling validation and event history under sole canonical CAS/receipt owner without a competing internal mutation entrypoint'
);

do $preflight$
declare v_command oid; v_impl oid; v_def text; v_role text;
begin
  v_command := to_regprocedure('public.studio2_integrity_record_preclearance_ruling(uuid,text,text,text,text[],uuid,text,bigint)');
  v_impl := to_regprocedure('public.admin_record_integrity_preclearance_ruling_impl(uuid,text,text,text,text[])');
  if v_command is null or v_impl is null then
    raise exception 'Missing canonical or internal pre-clearance implementation' using errcode = '55000';
  end if;
  select pg_get_functiondef(p.oid) into v_def from pg_proc p
  where p.oid = v_command and pg_get_userbyid(p.proowner) = 'postgres' and p.prosecdef;
  if v_def is null or strpos(v_def,'admin_record_integrity_preclearance_ruling_impl(')=0
    or strpos(v_def,'private.studio2_claim_operation(')=0
    or strpos(v_def,'private.studio2_complete_operation(')=0
    or strpos(v_def,'PT409')=0 then
    raise exception 'P04 pre-clearance command owner, CAS or receipt source drift' using errcode='55000';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(v_role,v_impl,'EXECUTE') then
      raise exception 'Internal pre-clearance writer directly executable by %',v_role using errcode='55000';
    end if;
  end loop;
end $preflight$;

create or replace function public.studio2_integrity_record_preclearance_ruling(
  p_case_id uuid,
  p_outcome text,
  p_summary text,
  p_rationale text,
  p_rule_ids text[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb language plpgsql security definer
set search_path = pg_catalog, public, private
as $body$
declare v_claim jsonb; v_operation uuid; v_case public.integrity_cases%rowtype; v_inner jsonb; v_result jsonb;
  v_case_kind text; v_id uuid; v_rules text[]; v_outcome text; v_summary text; v_rationale text;
begin
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if char_length(btrim(coalesce(p_rationale, ''))) < 20 then raise exception 'Pre-clearance rationale must be at least 20 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.preclearance', 'R3',
    jsonb_build_object(
      'caseId', p_case_id, 'outcome', p_outcome, 'summary', btrim(coalesce(p_summary, '')),
      'rationale', btrim(coalesce(p_rationale, '')), 'ruleIds', to_jsonb(coalesce(p_rule_ids, '{}'::text[])),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;
  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.preclearance', true);
  perform set_config('app.integrity_rationale', btrim(p_rationale), true);
  -- Retain the existing reviewed private-rule-question eligibility and
  -- mature rule ID/response validation, inside the sole CAS/receipt owner.
  select c.case_kind into v_case_kind
  from public.integrity_cases c
  where c.id = p_case_id for update;
  if v_case_kind is null then raise exception 'Integrity case not found'; end if;
  if v_case_kind <> 'rule_question' then
    raise exception 'Pre-clearance rulings are only available for private rule questions';
  end if;

  v_outcome := lower(btrim(coalesce(p_outcome, '')));
  if v_outcome not in ('allowed','not_allowed','needs_more_information','guidance_only') then
    raise exception 'Invalid pre-clearance outcome';
  end if;
  v_summary := btrim(coalesce(p_summary, ''));
  v_rationale := btrim(coalesce(p_rationale, ''));
  if char_length(v_summary) < 5 or char_length(v_summary) > 500 then
    raise exception 'Pre-clearance summary must be between 5 and 500 characters';
  end if;
  if char_length(v_rationale) < 20 or char_length(v_rationale) > 12000 then
    raise exception 'Pre-clearance rationale must be between 20 and 12000 characters';
  end if;

  perform public.integrity_validate_rule_ids(p_rule_ids);
  select array_agg(distinct trim(u.rule_id) order by trim(u.rule_id))
  into v_rules from unnest(p_rule_ids) as u(rule_id);

  insert into public.integrity_preclearance_rulings(
    case_id, outcome, summary, rationale, rule_ids, created_by
  ) values (
    p_case_id, v_outcome, v_summary, v_rationale, v_rules, auth.uid()
  ) returning id into v_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id)
  values (
    p_case_id,
    'preclearance.ruling',
    case v_outcome
      when 'allowed' then 'TSBC issued an Allowed pre-clearance ruling'
      when 'not_allowed' then 'TSBC issued a Not allowed pre-clearance ruling'
      when 'needs_more_information' then 'TSBC requested more information before issuing a final pre-clearance position'
      else 'TSBC issued guidance-only pre-clearance advice'
    end,
    true, auth.uid()
  );

  update public.integrity_cases
  set status = case when v_outcome = 'needs_more_information' then 'waiting_for_reporter' else status end,
      updated_at = now()
  where id = p_case_id;

  v_inner := jsonb_build_object('ok', true, 'ruling_id', v_id, 'outcome', v_outcome, 'rule_ids', v_rules);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

-- RESTRICT instead of CASCADE: an unknown dependent must block the migration.
-- The governed operation and original revision/event-history triggers persist.
drop function public.admin_record_integrity_preclearance_ruling_impl(uuid,text,text,text,text[]) restrict;

do $postflight$
begin
  if to_regprocedure('public.admin_record_integrity_preclearance_ruling_impl(uuid,text,text,text,text[])') is not null
     or pg_get_functiondef(to_regprocedure('public.studio2_integrity_record_preclearance_ruling(uuid,text,text,text,text[],uuid,text,bigint)')) like '%admin_record_integrity_preclearance_ruling_impl(%'
  then raise exception 'Duplicate pre-clearance writer remained' using errcode='55000'; end if;
end $postflight$;

notify pgrst, 'reload schema';
commit;
