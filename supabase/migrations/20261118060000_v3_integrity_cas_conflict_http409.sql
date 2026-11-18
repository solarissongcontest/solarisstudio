begin;

select public.v3_register_migration_contract(
  'v3.integrity.cas-conflict-http409',
  1,
  'forward_fix_only',
  false,
  null,
  'Return nonretryable HTTP 409 for reviewed Integrity CAS conflicts. PostgreSQL SQLSTATE 40001 is a retryable serialization failure and causes PostgREST to retry deterministic stale requests until gateway timeout.'
);

-- Guard the exact installed canonical commands before replacing their source.
-- All definitions below reproduce their effective P04 definition verbatim
-- except for the one CAS mismatch SQLSTATE: 40001 -> PT409.
do $guard$
declare v_name text; v_found integer; v_secure integer;
begin
  foreach v_name in array array[
    'studio2_integrity_case_transition',
    'studio2_integrity_assign_case_reviewer',
    'studio2_integrity_assign_appeal_reviewer',
    'studio2_integrity_grant_appeal_extension',
    'studio2_integrity_resolve_appeal',
    'studio2_integrity_set_case_priority',
    'studio2_integrity_reply_case',
    'studio2_integrity_record_finding',
    'studio2_integrity_record_sanction',
    'v3_reporter_reply_integrity_case',
    'v3_public_reply_anonymous_integrity_case',
    'studio2_integrity_recuse_case_reviewer',
    'studio2_integrity_add_case_note',
    'studio2_integrity_record_preclearance_ruling',
    'studio2_integrity_set_case_retention'
  ] loop
    select count(*),
           count(*) filter (where p.prosecdef
              and exists (
                select 1 from unnest(p.proconfig) as cfg
                where cfg like 'search_path=%'
                  and cfg like '%pg_catalog%'
              ))
      into v_found, v_secure
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_name;
    if v_found <> 1 or v_secure <> 1 then
      raise exception 'Missing/overloaded/unsecured effective P04 command: %, catalog %, protected %',
        v_name, v_found, v_secure;
    end if;
  end loop;
end $guard$;

-- PostgREST treats 40001 as retryable serialization failure. A stale reviewed
-- CAS version is a terminal HTTP conflict instead and must not be retried.

create or replace function public.studio2_integrity_case_transition(
  p_case_id uuid,
  p_target_status text,
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint,
  p_reason text default null
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
    p_operation_id, p_idempotency_key, 'integrity.case.transition', 'R3',
    jsonb_build_object('caseId', p_case_id, 'targetStatus', p_target_status, 'expectedVersion', p_expected_version, 'reason', nullif(btrim(coalesce(p_reason, '')), ''))
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;
  if not private.v3_integrity_case_transition_allowed(v_case.status, p_target_status) then
    raise exception 'Illegal Integrity case transition: % -> %', v_case.status, p_target_status using errcode = '23514';
  end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.transition', true);
  perform set_config('app.integrity_rationale', coalesce(nullif(btrim(coalesce(p_reason, '')), ''), ''), true);

  if v_case.status is distinct from p_target_status then
    update public.integrity_cases
    set status = p_target_status,
        closed_at = case when p_target_status like 'closed%' then coalesce(closed_at, now()) else null end
    where id = p_case_id;
  end if;

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'status', v_case.status, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_assign_case_reviewer(
  p_case_id uuid,
  p_user_id uuid,
  p_review_role text,
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
  if not public.studio2_access_allowed('integrity.manage', null, false) then raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected case version are required' using errcode = '22023'; end if;
  if p_review_role not in ('triage','investigator','decision_maker','appeal_reviewer') then raise exception 'Invalid review role' using errcode = '22023'; end if;
  if not exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role::text = 'organizer') then raise exception 'Reviewer must be an organizer' using errcode = '42501'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.case.assign_reviewer', 'R3',
    jsonb_build_object('caseId', p_case_id, 'userId', p_user_id, 'reviewRole', p_review_role, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null then raise exception 'Integrity case not found' using errcode = 'P0002'; end if;
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.case.assign_reviewer', true);

  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (p_case_id, p_user_id, p_review_role, auth.uid())
  on conflict (case_id, user_id, review_role) do update
    set assigned_by = excluded.assigned_by, assigned_at = now(), recused_at = null, recusal_reason = null;

  if p_review_role = 'investigator' then update public.integrity_cases set assigned_to = p_user_id where id = p_case_id; end if;
  select * into v_case from public.integrity_cases where id = p_case_id;

  insert into public.integrity_case_events(case_id, event_type, detail, visible_to_reporter, actor_user_id, operation_id, aggregate_version)
  values (p_case_id, 'reviewer.assigned', 'A ' || replace(p_review_role, '_', ' ') || ' was assigned', false, auth.uid(), v_operation, v_case.version);

  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_assign_appeal_reviewer(
  p_appeal_id uuid,
  p_user_id uuid,
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
  v_appeal public.integrity_case_appeals%rowtype;
  v_sanction_creator uuid;
  v_finding_creator uuid;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected appeal version are required' using errcode = '22023'; end if;
  -- The Permission Engine v2 role ledger, not legacy user_roles, is the
  -- authoritative source of global Organizer membership. Do not accept an
  -- expired or edition-local assignment for a cross-edition appeal review.
  if not exists (
    select 1 from public.studio2_role_assignments assignment
    where assignment.user_id = p_user_id
      and assignment.role_key = 'organizer'
      and assignment.edition_id is null
      and (assignment.expires_at is null or assignment.expires_at > now())
  ) then raise exception 'Appeal reviewer must be an organizer' using errcode = '42501'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.appeal.assign_reviewer', 'R3',
    jsonb_build_object('appealId', p_appeal_id, 'userId', p_user_id, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id for update;
  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;
  if v_appeal.status not in ('submitted','under_review') then raise exception 'Only an active appeal may be assigned' using errcode = '23514'; end if;

  select s.created_by, f.created_by
  into v_sanction_creator, v_finding_creator
  from public.integrity_case_sanctions s
  join public.integrity_case_findings f on f.id = s.finding_id
  where s.id = v_appeal.sanction_id;

  if p_user_id = v_appeal.submitted_by_user_id then raise exception 'The appeal submitter cannot review their own appeal' using errcode = '42501'; end if;
  if p_user_id = v_sanction_creator then raise exception 'The original sanction decision-maker cannot be the appeal reviewer' using errcode = '42501'; end if;
  if p_user_id = v_finding_creator then raise exception 'The original finding decision-maker cannot be the appeal reviewer' using errcode = '42501'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.assign_reviewer', true);

  update public.integrity_case_appeals
  set assigned_reviewer = p_user_id,
      status = case when status = 'submitted' then 'under_review' else status end
  where id = p_appeal_id;

  insert into public.integrity_case_reviewers(case_id, user_id, review_role, assigned_by)
  values (v_appeal.case_id, p_user_id, 'appeal_reviewer', auth.uid())
  on conflict (case_id, user_id, review_role) do update
    set assigned_by = excluded.assigned_by, assigned_at = now(), recused_at = null, recusal_reason = null;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id;
  v_result := jsonb_build_object('ok', true, 'appeal_id', p_appeal_id, 'status', v_appeal.status, 'version', v_appeal.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_grant_appeal_extension(
  p_appeal_id uuid,
  p_new_deadline timestamptz,
  p_reason text,
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
  v_appeal public.integrity_case_appeals%rowtype;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected appeal version are required' using errcode = '22023'; end if;
  p_reason := btrim(coalesce(p_reason, ''));
  if char_length(p_reason) < 10 or char_length(p_reason) > 4000 then raise exception 'Extension reason must be between 10 and 4000 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.appeal.extend_deadline', 'R3',
    jsonb_build_object('appealId', p_appeal_id, 'newDeadline', p_new_deadline, 'reason', p_reason, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id for update;
  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = 'PT409'; end if;
  if v_appeal.status <> 'rejected_late' then raise exception 'Only an appeal rejected as late can receive an exceptional deadline extension' using errcode = '23514'; end if;
  if p_new_deadline is null or p_new_deadline <= v_appeal.deadline_at then raise exception 'Extended deadline must be later than the original appeal deadline' using errcode = '23514'; end if;
  if p_new_deadline < v_appeal.submitted_at then raise exception 'Extended deadline must cover the already-submitted appeal' using errcode = '23514'; end if;
  if p_new_deadline > v_appeal.deadline_at + interval '14 days' then raise exception 'Exceptional appeal extensions cannot exceed 14 days without a rulebook change' using errcode = '23514'; end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.extend_deadline', true);
  perform set_config('app.integrity_rationale', p_reason, true);

  update public.integrity_case_appeals
  set deadline_at = p_new_deadline, was_timely = true, status = 'submitted',
      extension_granted_at = now(), extension_granted_by = auth.uid(), extension_reason = p_reason
  where id = p_appeal_id;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id;
  v_result := jsonb_build_object(
    'ok', true, 'appeal_id', p_appeal_id, 'deadline_at', v_appeal.deadline_at,
    'status', v_appeal.status, 'version', v_appeal.version, 'operation_id', v_operation
  );
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.studio2_integrity_resolve_appeal(
  p_appeal_id uuid,
  p_outcome text,
  p_decision_rationale text,
  p_replacement_level integer,
  p_aggravating_factors text[],
  p_mitigating_factors text[],
  p_operation_id uuid,
  p_idempotency_key text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $apply$
declare
  v_claim jsonb;
  v_operation uuid;
  v_appeal public.integrity_case_appeals%rowtype;
  v_original public.integrity_case_sanctions%rowtype;
  v_replacement_id uuid;
  v_label text;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then
    raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501';
  end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then
    raise exception 'Operation id and expected appeal version are required' using errcode = '22023';
  end if;
  if p_outcome not in ('upheld','reduced','increased','overturned','rejected_ineligible') then
    raise exception 'Invalid appeal outcome' using errcode = '22023';
  end if;

  p_decision_rationale := btrim(coalesce(p_decision_rationale, ''));
  if char_length(p_decision_rationale) < 20 or char_length(p_decision_rationale) > 12000 then
    raise exception 'Appeal rationale must be between 20 and 12000 characters' using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'integrity.appeal.resolve',
    'R3',
    jsonb_build_object(
      'appealId', p_appeal_id,
      'outcome', p_outcome,
      'decisionRationale', p_decision_rationale,
      'replacementLevel', p_replacement_level,
      'aggravatingFactors', to_jsonb(coalesce(p_aggravating_factors, '{}'::text[])),
      'mitigatingFactors', to_jsonb(coalesce(p_mitigating_factors, '{}'::text[])),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal
  from public.integrity_case_appeals
  where id = p_appeal_id
  for update;

  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then
    raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = 'PT409';
  end if;
  if v_appeal.status not in ('submitted','under_review') then
    raise exception 'Appeal has already been decided' using errcode = '23514';
  end if;
  if v_appeal.assigned_reviewer is null then
    raise exception 'Assign a fresh appeal reviewer before deciding the appeal' using errcode = '23514';
  end if;
  if v_appeal.assigned_reviewer <> auth.uid() then
    raise exception 'Only the assigned appeal reviewer may decide this appeal' using errcode = '42501';
  end if;

  select * into v_original
  from public.integrity_case_sanctions
  where id = v_appeal.sanction_id
  for update;
  if v_original.id is null then raise exception 'Appealed sanction not found' using errcode = 'P0002'; end if;

  if p_outcome in ('reduced','increased') then
    if p_replacement_level not between 1 and 10 then
      raise exception 'Replacement sanction level must be between 1 and 10' using errcode = '22023';
    end if;
    if p_outcome = 'reduced' and p_replacement_level >= v_original.final_level then
      raise exception 'A reduced appeal outcome must use a lower sanction level' using errcode = '23514';
    end if;
    if p_outcome = 'increased' and p_replacement_level <= v_original.final_level then
      raise exception 'An increased appeal outcome must use a higher sanction level' using errcode = '23514';
    end if;

    v_label := public.integrity_sanction_label(p_replacement_level);
    insert into public.integrity_case_sanctions(
      case_id, finding_id, typical_level, final_level, sanction_label,
      target_type, target_reference, aggravating_factors, mitigating_factors,
      rationale, status, supersedes_sanction_id, visible_to_reporter, created_by
    ) values (
      v_original.case_id,
      v_original.finding_id,
      v_original.final_level,
      p_replacement_level,
      v_label,
      v_original.target_type,
      v_original.target_reference,
      coalesce(p_aggravating_factors, '{}'),
      coalesce(p_mitigating_factors, '{}'),
      p_decision_rationale,
      'active',
      v_original.id,
      v_original.visible_to_reporter,
      auth.uid()
    ) returning id into v_replacement_id;

    update public.integrity_case_sanctions
    set status = 'modified_on_appeal'
    where id = v_original.id;
  elsif p_outcome = 'overturned' then
    update public.integrity_case_sanctions
    set status = 'overturned'
    where id = v_original.id;
  end if;

  perform set_config('app.integrity_operation_id', v_operation::text, true);
  perform set_config('app.integrity_command', 'integrity.appeal.resolve', true);
  perform set_config('app.integrity_rationale', p_decision_rationale, true);

  update public.integrity_case_appeals
  set status = p_outcome,
      decision_rationale = p_decision_rationale,
      replacement_sanction_id = v_replacement_id,
      decided_by = auth.uid(),
      decided_at = now()
  where id = p_appeal_id;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id;
  v_result := jsonb_build_object(
    'ok', true,
    'appeal_id', p_appeal_id,
    'outcome', p_outcome,
    'replacement_sanction_id', v_replacement_id,
    'version', v_appeal.version,
    'operation_id', v_operation
  );
  return private.studio2_complete_operation(v_operation, v_result);
end
$apply$;

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
  perform public.admin_set_integrity_priority_impl(p_case_id, p_priority);

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
  perform public.admin_reply_integrity_case_impl(p_case_id, p_body, coalesce(p_request_response, true));

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object('ok', true, 'case_id', p_case_id, 'status', v_case.status, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

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
  v_inner := public.admin_record_integrity_finding_impl(
    p_case_id, p_outcome, p_summary, p_rationale, coalesce(p_rule_ids, '{}'::text[]), coalesce(p_visible_to_reporter, true)
  );

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
  v_inner := public.admin_record_integrity_sanction_impl(
    p_case_id, p_finding_id, p_typical_level, p_final_level, p_target_type, p_target_reference,
    coalesce(p_aggravating_factors, '{}'::text[]), coalesce(p_mitigating_factors, '{}'::text[]),
    p_rationale, coalesce(p_visible_to_reporter, true)
  );

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

create or replace function public.v3_reporter_reply_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_id uuid,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_actor uuid := auth.uid();
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_message text := btrim(coalesce(p_body, ''));
  v_scope jsonb;
  v_request jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_case public.integrity_cases%rowtype;
  v_result jsonb;
begin
  if v_actor is null then raise exception 'Sign in required' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_scope := jsonb_build_object('caseId', p_case_id);
  v_request := jsonb_build_object('body', v_message, 'expectedVersion', p_expected_version);
  v_fingerprint := private.studio2_request_fingerprint('integrity.case.reporter_reply', 'R3', v_scope, v_request);

  insert into public.studio2_operation_receipts(
    operation_id, actor_id, idempotency_key, correlation_id,
    request_fingerprint, command, risk_class, scope
  ) values (
    p_operation_id, v_actor, v_key, p_operation_id,
    v_fingerprint, 'integrity.case.reporter_reply', 'R3', v_scope
  ) on conflict do nothing;

  select receipt.* into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = p_operation_id
     or (receipt.actor_id = v_actor and receipt.command = 'integrity.case.reporter_reply' and receipt.idempotency_key = v_key)
  order by case when receipt.operation_id = p_operation_id then 0 else 1 end
  limit 1
  for update;

  if v_receipt.operation_id is null
     or v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'integrity.case.reporter_reply'
     or v_receipt.idempotency_key is distinct from v_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_receipt.status = 'succeeded' then
    return coalesce(v_receipt.result, '{}'::jsonb) || jsonb_build_object('ok', true, 'operation_id', v_receipt.operation_id, 'replayed', true);
  end if;
  if v_receipt.status <> 'processing' then raise exception 'STATE_CHANGED' using errcode = 'P0001'; end if;

  select * into v_case from public.integrity_cases where id = p_case_id for update;
  if v_case.id is null or v_case.reporter_user_id is distinct from v_actor then
    raise exception 'Case not available' using errcode = '42501';
  end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409';
  end if;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply', true);
  v_result := public.reporter_reply_integrity_case_impl(p_case_id, v_message);

  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'snapshot', v_result,
    'case_id', p_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'receipt_id', p_operation_id
  );
  perform private.studio2_complete_operation(p_operation_id, v_result);
  return v_result || jsonb_build_object('replayed', false);
end
$body$;

create or replace function public.v3_public_reply_anonymous_integrity_case(
  p_operation_id uuid,
  p_idempotency_key text,
  p_case_code text,
  p_recovery_key text,
  p_body text,
  p_expected_version bigint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare
  v_key text := lower(btrim(coalesce(p_idempotency_key, '')));
  v_key_hash text;
  v_fingerprint text;
  v_row private.v3_anonymous_integrity_response_operations%rowtype;
  v_case_id uuid;
  v_case public.integrity_cases%rowtype;
  v_hash text;
  v_inner jsonb;
  v_result jsonb;
begin
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 or v_key !~ '^[0-9a-f]{64}$' then
    raise exception 'Valid operation identity and expected case version are required' using errcode = '22023';
  end if;

  v_key_hash := encode(extensions.digest(convert_to(v_key, 'UTF8'), 'sha256'), 'hex');
  v_fingerprint := private.studio2_request_fingerprint(
    'integrity.case.reporter_reply.anonymous', 'R3',
    jsonb_build_object('caseCode', upper(btrim(coalesce(p_case_code, '')))),
    jsonb_build_object('body', btrim(coalesce(p_body, '')), 'expectedVersion', p_expected_version)
  );

  insert into private.v3_anonymous_integrity_response_operations(idempotency_key_hash, operation_id, request_fingerprint)
  values (v_key_hash, p_operation_id, v_fingerprint)
  on conflict do nothing;

  select * into v_row
  from private.v3_anonymous_integrity_response_operations
  where idempotency_key_hash = v_key_hash
  for update;

  if v_row.operation_id is distinct from p_operation_id or v_row.request_fingerprint is distinct from v_fingerprint then
    raise exception 'IDEMPOTENCY_CONFLICT' using errcode = 'P0001';
  end if;
  if v_row.completed_at is not null then
    return coalesce(v_row.result, '{}'::jsonb) || jsonb_build_object('replayed', true);
  end if;

  v_hash := encode(extensions.digest(convert_to(public.integrity_normalize_secret(p_recovery_key), 'UTF8'), 'sha256'), 'hex');
  select c.* into v_case
  from public.integrity_cases c
  join public.integrity_case_access a on a.case_id = c.id
  where upper(c.public_code) = upper(btrim(coalesce(p_case_code, '')))
    and c.identity_mode = 'anonymous'
    and a.recovery_secret_hash = v_hash
  limit 1
  for update of c;
  if v_case.id is null then raise exception 'Case code or recovery key is incorrect' using errcode = '42501'; end if;
  if v_case.version <> p_expected_version then
    raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = 'PT409';
  end if;
  v_case_id := v_case.id;

  perform set_config('app.integrity_operation_id', p_operation_id::text, true);
  perform set_config('app.integrity_command', 'integrity.case.reporter_reply.anonymous', true);
  v_inner := public.public_reply_anonymous_integrity_case_impl(p_case_code, p_recovery_key, p_body);

  select * into v_case from public.integrity_cases where id = v_case_id;
  v_result := jsonb_build_object(
    'ok', true,
    'result', v_inner,
    'case_id', v_case_id,
    'status', v_case.status,
    'version', v_case.version,
    'operation_id', p_operation_id,
    'replayed', false
  );
  update private.v3_anonymous_integrity_response_operations
  set result = v_result, completed_at = now()
  where idempotency_key_hash = v_key_hash;
  return v_result;
end
$body$;

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
  v_inner := public.admin_recuse_from_integrity_case_impl(p_case_id, p_reason);

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
  v_inner := public.admin_add_integrity_case_note_impl(p_case_id, p_body);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

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
  v_inner := public.admin_record_integrity_preclearance_ruling_impl(p_case_id, p_outcome, p_summary, p_rationale, p_rule_ids);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

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
  v_inner := public.admin_set_integrity_case_retention_impl(p_case_id, p_retention_until, p_reason);
  select * into v_case from public.integrity_cases where id = p_case_id;
  v_result := coalesce(v_inner, '{}'::jsonb) || jsonb_build_object('case_id', p_case_id, 'version', v_case.version, 'operation_id', v_operation);
  return private.studio2_complete_operation(v_operation, v_result);
end $body$;

notify pgrst, 'reload schema';
commit;
