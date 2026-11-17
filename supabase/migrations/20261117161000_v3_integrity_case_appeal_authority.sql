begin;

select public.v3_register_migration_contract(
  'v3.integrity.case-appeal-authority',
  1,
  'forward_fix_only',
  false,
  null,
  'Govern Integrity case/appeal lifecycle, revisions, immutable history, canonical events, retry-safe decisions and direct-DML boundaries'
);

alter table public.integrity_cases
  add column if not exists version bigint not null default 1 check (version >= 1);

alter table public.integrity_case_appeals
  add column if not exists version bigint not null default 1 check (version >= 1);

alter table public.integrity_case_events
  add column if not exists operation_id uuid null,
  add column if not exists aggregate_version bigint null,
  add column if not exists event_metadata jsonb not null default '{}'::jsonb;

create table if not exists public.integrity_adjudication_history (
  id uuid primary key default gen_random_uuid(),
  aggregate_type text not null check (aggregate_type in ('case', 'appeal')),
  aggregate_id uuid not null,
  case_id uuid not null references public.integrity_cases(id) on delete restrict,
  revision bigint not null check (revision >= 1),
  operation_id uuid not null,
  event_type text not null check (event_type in ('integrity.case_changed', 'integrity.appeal_changed')),
  actor_user_id uuid null references auth.users(id) on delete set null,
  previous_state jsonb null,
  next_state jsonb not null,
  rationale text null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (aggregate_type, aggregate_id, revision)
);

alter table public.integrity_adjudication_history enable row level security;
revoke all on table public.integrity_adjudication_history from public, anon, authenticated;
revoke insert, update, delete, truncate on table public.integrity_adjudication_history from service_role;
grant select on table public.integrity_adjudication_history to service_role;

create or replace function private.v3_integrity_history_immutable()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
begin
  raise exception 'Integrity adjudication history is immutable' using errcode = '42501';
end
$body$;

revoke all on function private.v3_integrity_history_immutable() from public, anon, authenticated;
drop trigger if exists v3_integrity_history_immutable on public.integrity_adjudication_history;
create trigger v3_integrity_history_immutable
before update or delete on public.integrity_adjudication_history
for each row execute function private.v3_integrity_history_immutable();

create or replace function private.v3_integrity_operation_id()
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, extensions
as $body$
declare
  v_value text := nullif(current_setting('app.integrity_operation_id', true), '');
begin
  if v_value is not null then
    begin
      return v_value::uuid;
    exception when invalid_text_representation then
      null;
    end;
  end if;
  return extensions.gen_random_uuid();
end
$body$;

revoke all on function private.v3_integrity_operation_id() from public, anon, authenticated;

create or replace function private.v3_integrity_case_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $body$
  select case
    when p_from = p_to then true
    when p_from = 'received' then p_to in (
      'awaiting_review','under_review','waiting_for_reporter','investigation_opened','action_taken',
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    )
    when p_from = 'awaiting_review' then p_to in (
      'under_review','waiting_for_reporter','investigation_opened','action_taken',
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    )
    when p_from = 'under_review' then p_to in (
      'waiting_for_reporter','investigation_opened','action_taken',
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    )
    when p_from = 'waiting_for_reporter' then p_to in (
      'under_review','investigation_opened','action_taken',
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    )
    when p_from = 'investigation_opened' then p_to in (
      'under_review','waiting_for_reporter','action_taken',
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    )
    when p_from = 'action_taken' then p_to in ('under_review','closed')
    when p_from in (
      'closed_no_violation','closed_insufficient_evidence','closed_outside_jurisdiction','closed_duplicate','closed'
    ) then p_to = 'under_review'
    else false
  end;
$body$;

revoke all on function private.v3_integrity_case_transition_allowed(text, text) from public, anon, authenticated;

create or replace function private.v3_integrity_appeal_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = pg_catalog
as $body$
  select case
    when p_from = p_to then true
    when p_from = 'rejected_late' then p_to = 'submitted'
    when p_from = 'submitted' then p_to in ('under_review','upheld','reduced','increased','overturned','rejected_ineligible')
    when p_from = 'under_review' then p_to in ('upheld','reduced','increased','overturned','rejected_ineligible')
    else false
  end;
$body$;

revoke all on function private.v3_integrity_appeal_transition_allowed(text, text) from public, anon, authenticated;

create or replace function private.v3_integrity_case_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
begin
  if old.status is distinct from new.status
     and not private.v3_integrity_case_transition_allowed(old.status, new.status) then
    raise exception 'Illegal Integrity case transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  if old.status is distinct from new.status
     or old.assigned_to is distinct from new.assigned_to
     or old.priority is distinct from new.priority then
    new.version := old.version + 1;
    new.updated_at := now();
  elsif new.version is distinct from old.version then
    raise exception 'Integrity case version is server-managed' using errcode = '42501';
  end if;
  return new;
end
$body$;

revoke all on function private.v3_integrity_case_before_update() from public, anon, authenticated;
drop trigger if exists v3_integrity_case_before_update on public.integrity_cases;
create trigger v3_integrity_case_before_update
before update on public.integrity_cases
for each row execute function private.v3_integrity_case_before_update();

create or replace function private.v3_integrity_appeal_before_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
begin
  if old.status is distinct from new.status
     and not private.v3_integrity_appeal_transition_allowed(old.status, new.status) then
    raise exception 'Illegal Integrity appeal transition: % -> %', old.status, new.status using errcode = '23514';
  end if;

  if old.status is distinct from new.status
     or old.assigned_reviewer is distinct from new.assigned_reviewer
     or old.decision_rationale is distinct from new.decision_rationale
     or old.replacement_sanction_id is distinct from new.replacement_sanction_id
     or old.deadline_at is distinct from new.deadline_at
     or old.extension_granted_at is distinct from new.extension_granted_at then
    new.version := old.version + 1;
  elsif new.version is distinct from old.version then
    raise exception 'Integrity appeal version is server-managed' using errcode = '42501';
  end if;
  return new;
end
$body$;

revoke all on function private.v3_integrity_appeal_before_update() from public, anon, authenticated;
drop trigger if exists v3_integrity_appeal_before_update on public.integrity_case_appeals;
create trigger v3_integrity_appeal_before_update
before update on public.integrity_case_appeals
for each row execute function private.v3_integrity_appeal_before_update();

create or replace function private.v3_integrity_case_changed_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_operation uuid := private.v3_integrity_operation_id();
  v_previous jsonb;
  v_next jsonb;
  v_rationale text := nullif(current_setting('app.integrity_rationale', true), '');
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.assigned_to is not distinct from new.assigned_to
     and old.priority is not distinct from new.priority then
    return new;
  end if;

  v_previous := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'status', old.status, 'priority', old.priority, 'assignedTo', old.assigned_to, 'version', old.version
  ) end;
  v_next := jsonb_build_object(
    'status', new.status, 'priority', new.priority, 'assignedTo', new.assigned_to, 'version', new.version
  );

  insert into public.integrity_adjudication_history(
    aggregate_type, aggregate_id, case_id, revision, operation_id, event_type,
    actor_user_id, previous_state, next_state, rationale, metadata
  ) values (
    'case', new.id, new.id, new.version, v_operation, 'integrity.case_changed',
    auth.uid(), v_previous, v_next, v_rationale,
    jsonb_build_object('source', coalesce(nullif(current_setting('app.integrity_command', true), ''), 'sanctioned_compatibility'))
  );

  insert into public.integrity_case_events(
    case_id, event_type, detail, visible_to_reporter, actor_user_id,
    operation_id, aggregate_version, event_metadata
  ) values (
    new.id, 'integrity.case_changed',
    case when tg_op = 'INSERT' then 'Canonical case created' else 'Canonical case adjudication state changed' end,
    false, auth.uid(), v_operation, new.version,
    jsonb_build_object('previous', v_previous, 'next', v_next)
  );
  return new;
end
$body$;

revoke all on function private.v3_integrity_case_changed_event() from public, anon, authenticated;
drop trigger if exists v3_integrity_case_changed_event on public.integrity_cases;
create trigger v3_integrity_case_changed_event
after insert or update on public.integrity_cases
for each row execute function private.v3_integrity_case_changed_event();

create or replace function private.v3_integrity_appeal_changed_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $body$
declare
  v_operation uuid := private.v3_integrity_operation_id();
  v_previous jsonb;
  v_next jsonb;
  v_rationale text := coalesce(new.decision_rationale, new.extension_reason, nullif(current_setting('app.integrity_rationale', true), ''));
begin
  if tg_op = 'UPDATE'
     and old.status is not distinct from new.status
     and old.assigned_reviewer is not distinct from new.assigned_reviewer
     and old.decision_rationale is not distinct from new.decision_rationale
     and old.replacement_sanction_id is not distinct from new.replacement_sanction_id
     and old.deadline_at is not distinct from new.deadline_at
     and old.extension_granted_at is not distinct from new.extension_granted_at then
    return new;
  end if;

  v_previous := case when tg_op = 'INSERT' then null else jsonb_build_object(
    'status', old.status, 'assignedReviewer', old.assigned_reviewer, 'deadlineAt', old.deadline_at,
    'replacementSanctionId', old.replacement_sanction_id, 'version', old.version
  ) end;
  v_next := jsonb_build_object(
    'status', new.status, 'assignedReviewer', new.assigned_reviewer, 'deadlineAt', new.deadline_at,
    'replacementSanctionId', new.replacement_sanction_id, 'version', new.version
  );

  insert into public.integrity_adjudication_history(
    aggregate_type, aggregate_id, case_id, revision, operation_id, event_type,
    actor_user_id, previous_state, next_state, rationale, metadata
  ) values (
    'appeal', new.id, new.case_id, new.version, v_operation, 'integrity.appeal_changed',
    auth.uid(), v_previous, v_next, v_rationale,
    jsonb_build_object('source', coalesce(nullif(current_setting('app.integrity_command', true), ''), 'sanctioned_compatibility'))
  );

  insert into public.integrity_case_events(
    case_id, event_type, detail, visible_to_reporter, actor_user_id,
    operation_id, aggregate_version, event_metadata
  ) values (
    new.case_id, 'integrity.appeal_changed',
    case when tg_op = 'INSERT' then 'Canonical appeal submitted' else 'Canonical appeal adjudication state changed' end,
    false, auth.uid(), v_operation, new.version,
    jsonb_build_object('appealId', new.id, 'previous', v_previous, 'next', v_next)
  );
  return new;
end
$body$;

revoke all on function private.v3_integrity_appeal_changed_event() from public, anon, authenticated;
drop trigger if exists v3_integrity_appeal_changed_event on public.integrity_case_appeals;
create trigger v3_integrity_appeal_changed_event
after insert or update on public.integrity_case_appeals
for each row execute function private.v3_integrity_appeal_changed_event();

-- Close the concurrent duplicate-submission race without rewriting history.
do $body$
begin
  if exists (
    select 1 from public.integrity_case_appeals
    where submitted_via <> 'organizer'
    group by sanction_id
    having count(*) > 1
  ) then
    raise exception 'Cannot install Integrity appeal uniqueness: duplicate participant appeals already exist';
  end if;
end
$body$;

create unique index if not exists integrity_case_appeals_one_participant_per_sanction_idx
  on public.integrity_case_appeals(sanction_id)
  where submitted_via <> 'organizer';

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
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;
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

revoke all on function public.studio2_integrity_case_transition(uuid, text, uuid, text, bigint, text) from public, anon;
grant execute on function public.studio2_integrity_case_transition(uuid, text, uuid, text, bigint, text) to authenticated, service_role;

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
  if v_case.version <> p_expected_version then raise exception 'Integrity case changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;

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

revoke all on function public.studio2_integrity_assign_case_reviewer(uuid, uuid, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_assign_case_reviewer(uuid, uuid, text, uuid, text, bigint) to authenticated, service_role;

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
  if not exists (select 1 from public.user_roles ur where ur.user_id = p_user_id and ur.role::text = 'organizer') then raise exception 'Appeal reviewer must be an organizer' using errcode = '42501'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.appeal.assign_reviewer', 'R3',
    jsonb_build_object('appealId', p_appeal_id, 'userId', p_user_id, 'expectedVersion', p_expected_version)
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id for update;
  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;
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

revoke all on function public.studio2_integrity_assign_appeal_reviewer(uuid, uuid, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_assign_appeal_reviewer(uuid, uuid, uuid, text, bigint) to authenticated, service_role;

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
as $body$
declare
  v_claim jsonb;
  v_operation uuid;
  v_appeal public.integrity_case_appeals%rowtype;
  v_original public.integrity_case_sanctions%rowtype;
  v_replacement_id uuid;
  v_label text;
  v_result jsonb;
begin
  if not public.studio2_access_allowed('integrity.sanction', null, false) then raise exception 'Missing Solaris capability: integrity.sanction' using errcode = '42501'; end if;
  if p_operation_id is null or p_expected_version is null or p_expected_version < 1 then raise exception 'Operation id and expected appeal version are required' using errcode = '22023'; end if;
  if p_outcome not in ('upheld','reduced','increased','overturned','rejected_ineligible') then raise exception 'Invalid appeal outcome' using errcode = '22023'; end if;
  p_decision_rationale := btrim(coalesce(p_decision_rationale, ''));
  if char_length(p_decision_rationale) < 20 or char_length(p_decision_rationale) > 12000 then raise exception 'Appeal rationale must be between 20 and 12000 characters' using errcode = '22023'; end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id, p_idempotency_key, 'integrity.appeal.resolve', 'R4',
    jsonb_build_object(
      'appealId', p_appeal_id, 'outcome', p_outcome, 'decisionRationale', p_decision_rationale,
      'replacementLevel', p_replacement_level,
      'aggravatingFactors', to_jsonb(coalesce(p_aggravating_factors, '{}'::text[])),
      'mitigatingFactors', to_jsonb(coalesce(p_mitigating_factors, '{}'::text[])),
      'expectedVersion', p_expected_version
    )
  );
  if coalesce((v_claim ->> 'replayed')::boolean, false) then return v_claim -> 'result'; end if;
  v_operation := (v_claim ->> 'operationId')::uuid;

  select * into v_appeal from public.integrity_case_appeals where id = p_appeal_id for update;
  if v_appeal.id is null then raise exception 'Appeal not found' using errcode = 'P0002'; end if;
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;
  if v_appeal.status not in ('submitted','under_review') then raise exception 'Appeal has already been decided' using errcode = '23514'; end if;
  if v_appeal.assigned_reviewer is null then raise exception 'Assign a fresh appeal reviewer before deciding the appeal' using errcode = '23514'; end if;
  if v_appeal.assigned_reviewer <> auth.uid() then raise exception 'Only the assigned appeal reviewer may decide this appeal' using errcode = '42501'; end if;

  select * into v_original from public.integrity_case_sanctions where id = v_appeal.sanction_id for update;
  if v_original.id is null then raise exception 'Appealed sanction not found' using errcode = 'P0002'; end if;

  if p_outcome in ('reduced','increased') then
    if p_replacement_level not between 1 and 10 then raise exception 'Replacement sanction level must be between 1 and 10' using errcode = '22023'; end if;
    if p_outcome = 'reduced' and p_replacement_level >= v_original.final_level then raise exception 'A reduced appeal outcome must use a lower sanction level' using errcode = '23514'; end if;
    if p_outcome = 'increased' and p_replacement_level <= v_original.final_level then raise exception 'An increased appeal outcome must use a higher sanction level' using errcode = '23514'; end if;

    v_label := public.integrity_sanction_label(p_replacement_level);
    insert into public.integrity_case_sanctions(
      case_id, finding_id, typical_level, final_level, sanction_label,
      target_type, target_reference, aggravating_factors, mitigating_factors,
      rationale, status, supersedes_sanction_id, visible_to_reporter, created_by
    ) values (
      v_original.case_id, v_original.finding_id, v_original.final_level, p_replacement_level, v_label,
      v_original.target_type, v_original.target_reference, coalesce(p_aggravating_factors, '{}'),
      coalesce(p_mitigating_factors, '{}'), p_decision_rationale, 'active',
      v_original.id, v_original.visible_to_reporter, auth.uid()
    ) returning id into v_replacement_id;
    update public.integrity_case_sanctions set status = 'modified_on_appeal' where id = v_original.id;
  elsif p_outcome = 'overturned' then
    update public.integrity_case_sanctions set status = 'overturned' where id = v_original.id;
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
    'ok', true, 'appeal_id', p_appeal_id, 'outcome', p_outcome,
    'replacement_sanction_id', v_replacement_id, 'version', v_appeal.version,
    'operation_id', v_operation
  );
  return private.studio2_complete_operation(v_operation, v_result);
end
$body$;

revoke all on function public.studio2_integrity_resolve_appeal(uuid, text, text, integer, text[], text[], uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_resolve_appeal(uuid, text, text, integer, text[], text[], uuid, text, bigint) to authenticated, service_role;

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
  if v_appeal.version <> p_expected_version then raise exception 'Appeal changed since it was loaded. Refresh before continuing.' using errcode = '40001'; end if;
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

revoke all on function public.studio2_integrity_grant_appeal_extension(uuid, timestamptz, text, uuid, text, bigint) from public, anon;
grant execute on function public.studio2_integrity_grant_appeal_extension(uuid, timestamptz, text, uuid, text, bigint) to authenticated, service_role;

-- Existing Organizer callers are kept alive only as narrow compatibility shims.
-- Owner: Integrity authority. Scope: current Organizer routes. Sunset: remove once
-- callers pass stable operation identity and loaded aggregate versions directly.
create or replace function public.admin_update_integrity_case_status(_case_id uuid, _status text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare v_version bigint; v_operation uuid := extensions.gen_random_uuid();
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found'; end if;
  return public.studio2_integrity_case_transition(
    _case_id, _status, v_operation,
    encode(extensions.digest(convert_to('integrity-case-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    v_version, null
  );
end
$body$;

create or replace function public.admin_assign_integrity_reviewer(_case_id uuid, _user_id uuid, _review_role text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare v_version bigint; v_operation uuid := extensions.gen_random_uuid();
begin
  select version into v_version from public.integrity_cases where id = _case_id;
  if v_version is null then raise exception 'Integrity case not found'; end if;
  return public.studio2_integrity_assign_case_reviewer(
    _case_id, _user_id, _review_role, v_operation,
    encode(extensions.digest(convert_to('integrity-case-reviewer-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    v_version
  );
end
$body$;

create or replace function public.admin_assign_integrity_appeal_reviewer(_appeal_id uuid, _user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare v_version bigint; v_operation uuid := extensions.gen_random_uuid();
begin
  select version into v_version from public.integrity_case_appeals where id = _appeal_id;
  if v_version is null then raise exception 'Appeal not found'; end if;
  return public.studio2_integrity_assign_appeal_reviewer(
    _appeal_id, _user_id, v_operation,
    encode(extensions.digest(convert_to('integrity-appeal-reviewer-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    v_version
  );
end
$body$;

create or replace function public.admin_decide_integrity_appeal(
  _appeal_id uuid,
  _outcome text,
  _decision_rationale text,
  _replacement_level integer default null,
  _aggravating_factors text[] default '{}',
  _mitigating_factors text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare v_version bigint; v_operation uuid := extensions.gen_random_uuid();
begin
  select version into v_version from public.integrity_case_appeals where id = _appeal_id;
  if v_version is null then raise exception 'Appeal not found'; end if;
  return public.studio2_integrity_resolve_appeal(
    _appeal_id, _outcome, _decision_rationale, _replacement_level,
    _aggravating_factors, _mitigating_factors, v_operation,
    encode(extensions.digest(convert_to('integrity-appeal-resolve-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    v_version
  );
end
$body$;

create or replace function public.admin_grant_integrity_appeal_extension(_appeal_id uuid, _new_deadline timestamptz, _reason text)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, extensions
as $body$
declare v_version bigint; v_operation uuid := extensions.gen_random_uuid();
begin
  select version into v_version from public.integrity_case_appeals where id = _appeal_id;
  if v_version is null then raise exception 'Appeal not found'; end if;
  return public.studio2_integrity_grant_appeal_extension(
    _appeal_id, _new_deadline, _reason, v_operation,
    encode(extensions.digest(convert_to('integrity-appeal-extension-compat:' || v_operation::text, 'UTF8'), 'sha256'), 'hex'),
    v_version
  );
end
$body$;

revoke insert, update, delete, truncate on table public.integrity_cases from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.integrity_case_appeals from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.integrity_case_sanctions from anon, authenticated, service_role;
revoke insert, update, delete, truncate on table public.integrity_case_findings from anon, authenticated, service_role;

comment on function public.admin_update_integrity_case_status(uuid, text) is
  'Temporary compatibility shim; canonical implementation is studio2_integrity_case_transition.';
comment on function public.admin_assign_integrity_reviewer(uuid, uuid, text) is
  'Temporary compatibility shim; canonical implementation is studio2_integrity_assign_case_reviewer.';
comment on function public.admin_assign_integrity_appeal_reviewer(uuid, uuid) is
  'Temporary compatibility shim; canonical implementation is studio2_integrity_assign_appeal_reviewer.';
comment on function public.admin_decide_integrity_appeal(uuid, text, text, integer, text[], text[]) is
  'Temporary compatibility shim; canonical implementation is studio2_integrity_resolve_appeal.';
comment on function public.admin_grant_integrity_appeal_extension(uuid, timestamptz, text) is
  'Temporary compatibility shim; canonical implementation is studio2_integrity_grant_appeal_extension.';

notify pgrst, 'reload schema';
commit;
