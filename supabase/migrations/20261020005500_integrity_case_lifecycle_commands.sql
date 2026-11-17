begin;

select public.v3_register_migration_contract(
  '20261020005500_integrity_case_lifecycle_commands',
  1,
  'forward_fix_only',
  false,
  null,
  'O13 versioned/idempotent Integrity case lifecycle transition authority with transactional DomainEvent/outbox effects.'
);

create table if not exists public.studio2_integrity_case_versions (
  case_id uuid primary key references public.integrity_cases(id) on delete cascade,
  version bigint not null default 0 check (version >= 0),
  updated_at timestamptz not null default now()
);

insert into public.studio2_integrity_case_versions (case_id, version)
select integrity_case.id, 0
from public.integrity_cases integrity_case
on conflict (case_id) do nothing;

alter table public.studio2_integrity_case_versions enable row level security;
revoke all on table public.studio2_integrity_case_versions from public, anon, authenticated;
grant all on table public.studio2_integrity_case_versions to service_role;

create or replace function private.studio2_touch_integrity_case_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $touch$
declare
  v_case_id uuid;
begin
  if tg_table_name = 'integrity_cases' then
    if tg_op = 'DELETE' then return old; end if;
    v_case_id := new.id;
  else
    if tg_op = 'DELETE' then v_case_id := old.case_id;
    else v_case_id := new.case_id;
    end if;
  end if;

  if v_case_id is not null
     and exists (select 1 from public.integrity_cases integrity_case where integrity_case.id = v_case_id) then
    insert into public.studio2_integrity_case_versions (case_id, version, updated_at)
    values (v_case_id, 1, now())
    on conflict (case_id) do update
    set version = public.studio2_integrity_case_versions.version + 1,
        updated_at = excluded.updated_at;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$touch$;

revoke all on function private.studio2_touch_integrity_case_version()
  from public, anon, authenticated;

drop trigger if exists studio2_integrity_case_touch_version on public.integrity_cases;
create trigger studio2_integrity_case_touch_version
after insert or update on public.integrity_cases
for each row execute function private.studio2_touch_integrity_case_version();

drop trigger if exists studio2_integrity_finding_touch_case_version on public.integrity_case_findings;
create trigger studio2_integrity_finding_touch_case_version
after insert or update or delete on public.integrity_case_findings
for each row execute function private.studio2_touch_integrity_case_version();

drop trigger if exists studio2_integrity_sanction_touch_case_version on public.integrity_case_sanctions;
create trigger studio2_integrity_sanction_touch_case_version
after insert or update or delete on public.integrity_case_sanctions
for each row execute function private.studio2_touch_integrity_case_version();

drop trigger if exists studio2_integrity_appeal_touch_case_version on public.integrity_case_appeals;
create trigger studio2_integrity_appeal_touch_case_version
after insert or update or delete on public.integrity_case_appeals
for each row execute function private.studio2_touch_integrity_case_version();

drop trigger if exists studio2_integrity_reviewer_touch_case_version on public.integrity_case_reviewers;
create trigger studio2_integrity_reviewer_touch_case_version
after insert or update or delete on public.integrity_case_reviewers
for each row execute function private.studio2_touch_integrity_case_version();

drop trigger if exists studio2_integrity_request_touch_case_version on public.integrity_case_requests;
create trigger studio2_integrity_request_touch_case_version
after insert or update or delete on public.integrity_case_requests
for each row execute function private.studio2_touch_integrity_case_version();

create or replace function private.studio2_integrity_case_transition_context(
  p_case_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $context$
declare
  v_case public.integrity_cases%rowtype;
  v_version bigint := 0;
  v_findings jsonb := '{}'::jsonb;
  v_finding_count integer := 0;
  v_violation_findings integer := 0;
  v_no_violation_findings integer := 0;
  v_insufficient_findings integer := 0;
  v_outside_findings integer := 0;
  v_duplicate_findings integer := 0;
  v_admin_resolution_findings integer := 0;
  v_active_sanctions integer := 0;
  v_open_appeals integer := 0;
  v_open_requests integer := 0;
  v_active_reviewers integer := 0;
  v_actor_recused boolean := false;
  v_actor_active_reviewer boolean := false;
  v_is_closure boolean := false;
  v_is_reopen boolean := false;
  v_is_closed_reclassification boolean := false;
  v_blockers jsonb := '[]'::jsonb;
  v_risk text := 'R2';
begin
  if p_case_id is null then
    raise exception 'Integrity case is required' using errcode = '22023';
  end if;
  if p_target_status not in (
    'received', 'awaiting_review', 'under_review', 'waiting_for_reporter',
    'investigation_opened', 'action_taken', 'closed_no_violation',
    'closed_insufficient_evidence', 'closed_outside_jurisdiction',
    'closed_duplicate', 'closed'
  ) then
    raise exception 'Invalid Integrity case target status' using errcode = '22023';
  end if;
  if not public.studio2_access_allowed('integrity.manage', null, false) then
    raise exception 'Missing Solaris capability: integrity.manage' using errcode = '42501';
  end if;

  select integrity_case.* into v_case
  from public.integrity_cases integrity_case
  where integrity_case.id = p_case_id;
  if v_case.id is null then
    raise exception 'Integrity case not found' using errcode = 'P0002';
  end if;

  select coalesce(version, 0)
  into v_version
  from public.studio2_integrity_case_versions
  where case_id = p_case_id;

  select
    count(*)::integer,
    count(*) filter (where finding.outcome = 'violation')::integer,
    count(*) filter (where finding.outcome = 'no_violation')::integer,
    count(*) filter (where finding.outcome = 'insufficient_evidence')::integer,
    count(*) filter (where finding.outcome = 'outside_jurisdiction')::integer,
    count(*) filter (where finding.outcome = 'duplicate')::integer,
    count(*) filter (where finding.outcome = 'administrative_resolution')::integer,
    jsonb_build_object(
      'violation', count(*) filter (where finding.outcome = 'violation'),
      'noViolation', count(*) filter (where finding.outcome = 'no_violation'),
      'insufficientEvidence', count(*) filter (where finding.outcome = 'insufficient_evidence'),
      'outsideJurisdiction', count(*) filter (where finding.outcome = 'outside_jurisdiction'),
      'duplicate', count(*) filter (where finding.outcome = 'duplicate'),
      'administrativeResolution', count(*) filter (where finding.outcome = 'administrative_resolution')
    )
  into
    v_finding_count,
    v_violation_findings,
    v_no_violation_findings,
    v_insufficient_findings,
    v_outside_findings,
    v_duplicate_findings,
    v_admin_resolution_findings,
    v_findings
  from public.integrity_case_findings finding
  where finding.case_id = p_case_id;

  select count(*)::integer into v_active_sanctions
  from public.integrity_case_sanctions sanction
  where sanction.case_id = p_case_id
    and sanction.status = 'active';

  select count(*)::integer into v_open_appeals
  from public.integrity_case_appeals appeal
  where appeal.case_id = p_case_id
    and appeal.status in ('submitted', 'under_review');

  select count(*)::integer into v_open_requests
  from public.integrity_case_requests request_row
  where request_row.case_id = p_case_id
    and request_row.status = 'open';

  select count(*) filter (where reviewer.recused_at is null)::integer
  into v_active_reviewers
  from public.integrity_case_reviewers reviewer
  where reviewer.case_id = p_case_id;

  select
    exists (
      select 1 from public.integrity_case_reviewers reviewer
      where reviewer.case_id = p_case_id
        and reviewer.user_id = auth.uid()
        and reviewer.recused_at is not null
    ),
    exists (
      select 1 from public.integrity_case_reviewers reviewer
      where reviewer.case_id = p_case_id
        and reviewer.user_id = auth.uid()
        and reviewer.recused_at is null
    )
  into v_actor_recused, v_actor_active_reviewer;

  v_is_closure := p_target_status like 'closed%';
  v_is_reopen := v_case.status like 'closed%' and p_target_status not like 'closed%';
  v_is_closed_reclassification := v_case.status like 'closed%' and p_target_status like 'closed%'
    and v_case.status <> p_target_status;
  if v_is_closure or v_is_reopen or v_is_closed_reclassification then
    v_risk := 'R3';
  end if;

  if v_case.status = p_target_status then
    v_blockers := v_blockers || jsonb_build_array('The Integrity case is already in the requested lifecycle state.');
  end if;

  if v_actor_recused and not v_actor_active_reviewer then
    v_blockers := v_blockers || jsonb_build_array('You are recused from this Integrity case and cannot change its lifecycle state.');
  end if;

  if v_is_closure then
    if v_open_appeals > 0 then
      v_blockers := v_blockers || jsonb_build_array('Resolve all submitted or under-review appeals before closing the case.');
    end if;
    if v_open_requests > 0 then
      v_blockers := v_blockers || jsonb_build_array('Resolve or close outstanding case requests before closing the case.');
    end if;
    if p_target_status = 'closed_no_violation' and v_no_violation_findings = 0 then
      v_blockers := v_blockers || jsonb_build_array('A no-violation finding is required for closed_no_violation.');
    elsif p_target_status = 'closed_insufficient_evidence' and v_insufficient_findings = 0 then
      v_blockers := v_blockers || jsonb_build_array('An insufficient-evidence finding is required for closed_insufficient_evidence.');
    elsif p_target_status = 'closed_outside_jurisdiction' and v_outside_findings = 0 then
      v_blockers := v_blockers || jsonb_build_array('An outside-jurisdiction finding is required for closed_outside_jurisdiction.');
    elsif p_target_status = 'closed_duplicate' and v_duplicate_findings = 0 then
      v_blockers := v_blockers || jsonb_build_array('A duplicate finding is required for closed_duplicate.');
    elsif p_target_status = 'closed' and v_finding_count = 0 then
      v_blockers := v_blockers || jsonb_build_array('Record a finding before closing an Integrity case.');
    end if;

    if p_target_status in (
      'closed_no_violation',
      'closed_insufficient_evidence',
      'closed_outside_jurisdiction',
      'closed_duplicate'
    ) and v_active_sanctions > 0 then
      v_blockers := v_blockers || jsonb_build_array('Resolve active sanctions before closing the case with a non-violation administrative outcome.');
    end if;
  end if;

  if p_target_status = 'action_taken' and v_violation_findings = 0 and v_active_sanctions = 0 then
    v_blockers := v_blockers || jsonb_build_array('Action taken requires a violation finding or active sanction.');
  end if;

  return jsonb_build_object(
    'caseId', v_case.id,
    'publicCode', v_case.public_code,
    'currentStatus', v_case.status,
    'targetStatus', p_target_status,
    'expectedVersion', v_version,
    'riskClass', v_risk,
    'isClosure', v_is_closure,
    'isReopen', v_is_reopen,
    'isClosedReclassification', v_is_closed_reclassification,
    'reasonRequired', v_is_closure or v_is_reopen or v_is_closed_reclassification,
    'findings', v_findings,
    'findingCount', v_finding_count,
    'activeSanctionCount', v_active_sanctions,
    'openAppealCount', v_open_appeals,
    'openRequestCount', v_open_requests,
    'activeReviewerCount', v_active_reviewers,
    'actorRecused', v_actor_recused,
    'actorActiveReviewer', v_actor_active_reviewer,
    'closureAllowed', (not v_is_closure) or jsonb_array_length(v_blockers) = 0,
    'reopenAllowed', (not v_is_reopen) or jsonb_array_length(v_blockers) = 0,
    'consequence', case
      when v_is_reopen then 'The case returns to active investigation and the Organizer review task becomes actionable again.'
      when v_is_closure then 'The case is closed, closed_at is recorded, and the Organizer review task resolves.'
      else 'The case lifecycle state changes without rewriting findings, sanctions, appeals or historical events.'
    end,
    'blockers', v_blockers,
    'serverTime', statement_timestamp()
  );
end;
$context$;

revoke all on function private.studio2_integrity_case_transition_context(uuid, text)
  from public, anon, authenticated;

create or replace function public.studio2_integrity_case_transition_preview(
  p_case_id uuid,
  p_target_status text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private, auth
as $preview$
begin
  return private.studio2_integrity_case_transition_context(p_case_id, p_target_status);
end;
$preview$;

revoke all on function public.studio2_integrity_case_transition_preview(uuid, text)
  from public, anon;
grant execute on function public.studio2_integrity_case_transition_preview(uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_apply_integrity_case_transition(
  p_case_id uuid,
  p_target_status text,
  p_reason text,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $apply$
declare
  v_before public.integrity_cases%rowtype;
  v_after public.integrity_cases%rowtype;
  v_context jsonb;
  v_version bigint := 0;
  v_next_version bigint := 0;
  v_risk text;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_claim jsonb;
  v_operation_id uuid;
  v_event_id uuid;
  v_result jsonb;
begin
  if p_case_id is null or p_expected_version is null or p_expected_version < 0
     or p_operation_id is null or nullif(btrim(coalesce(p_idempotency_key, '')), '') is null then
    raise exception 'Case, expected version, operation id and idempotency key are required'
      using errcode = '22023';
  end if;

  v_context := private.studio2_integrity_case_transition_context(p_case_id, p_target_status);
  v_risk := v_context ->> 'riskClass';
  if coalesce((v_context ->> 'reasonRequired')::boolean, false)
     and char_length(coalesce(v_reason, '')) < 8 then
    raise exception 'A written reason of at least 8 characters is required for Integrity case closure, reopening or closed-state reclassification'
      using errcode = '22023';
  end if;

  v_claim := private.studio2_claim_operation(
    p_operation_id,
    p_idempotency_key,
    'integrity.case_transition',
    v_risk,
    jsonb_build_object(
      'caseId', p_case_id,
      'publicCode', v_context ->> 'publicCode',
      'fromStatus', v_context ->> 'currentStatus',
      'targetStatus', p_target_status,
      'reason', v_reason,
      'expectedVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' then
      return v_claim -> 'result';
    end if;
    raise exception 'Integrity case transition is already processing or requires reconciliation'
      using errcode = '40001';
  end if;
  v_operation_id := (v_claim ->> 'operationId')::uuid;

  perform pg_advisory_xact_lock(
    hashtextextended('studio2-integrity-case:' || p_case_id::text, 0)
  );

  select integrity_case.* into v_before
  from public.integrity_cases integrity_case
  where integrity_case.id = p_case_id
  for update;
  if v_before.id is null then
    raise exception 'Integrity case not found' using errcode = 'P0002';
  end if;

  select version into v_version
  from public.studio2_integrity_case_versions
  where case_id = p_case_id
  for update;
  if not found then
    insert into public.studio2_integrity_case_versions(case_id, version)
    values (p_case_id, 0)
    on conflict (case_id) do nothing;
    select version into v_version
    from public.studio2_integrity_case_versions
    where case_id = p_case_id
    for update;
  end if;
  v_version := coalesce(v_version, 0);

  if p_expected_version <> v_version then
    raise exception 'Integrity case changed since this transition was reviewed. Refresh and review the current case before applying anything.'
      using errcode = '40001';
  end if;

  v_context := private.studio2_integrity_case_transition_context(p_case_id, p_target_status);
  if (v_context ->> 'expectedVersion')::bigint <> v_version then
    raise exception 'Integrity case dependency state changed while the transition was being prepared'
      using errcode = '40001';
  end if;
  if jsonb_array_length(coalesce(v_context -> 'blockers', '[]'::jsonb)) > 0 then
    raise exception 'Integrity case transition is blocked: %', v_context -> 'blockers'
      using errcode = '23514';
  end if;
  if coalesce((v_context ->> 'reasonRequired')::boolean, false)
     and char_length(coalesce(v_reason, '')) < 8 then
    raise exception 'A written reason of at least 8 characters is required for this Integrity case transition'
      using errcode = '22023';
  end if;

  update public.integrity_cases
  set status = p_target_status,
      updated_at = now(),
      closed_at = case when p_target_status like 'closed%' then coalesce(closed_at, now()) else null end
  where id = p_case_id
  returning * into v_after;

  insert into public.integrity_case_events(
    case_id,
    event_type,
    detail,
    visible_to_reporter,
    actor_user_id
  ) values (
    p_case_id,
    'status.changed',
    concat(
      v_before.status,
      ' → ',
      p_target_status,
      case when v_reason is null then '' else ' · ' || v_reason end
    ),
    true,
    auth.uid()
  );

  insert into public.admin_audit_log(
    actor_id,
    action,
    table_name,
    record_id,
    before_data,
    after_data
  ) values (
    auth.uid(),
    'integrity_case_transitioned',
    'integrity_cases',
    p_case_id::text,
    jsonb_build_object(
      'status', v_before.status,
      'closedAt', v_before.closed_at,
      'version', v_version
    ),
    jsonb_build_object(
      'status', v_after.status,
      'closedAt', v_after.closed_at,
      'reason', v_reason
    )
  );

  select coalesce(version, v_version + 1)
  into v_next_version
  from public.studio2_integrity_case_versions
  where case_id = p_case_id;

  v_event_id := private.v3_emit_domain_event(
    'integrity.case_changed',
    'integrity_case',
    p_case_id::text,
    v_next_version,
    v_operation_id,
    null,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'caseId', p_case_id,
      'publicCode', v_after.public_code,
      'fromStatus', v_before.status,
      'status', v_after.status,
      'previousVersion', v_version,
      'version', v_next_version,
      'reason', v_reason
    )),
    1,
    array['integrity.tasks']::text[]
  );

  -- Preserve immediate Organizer task correctness even if the asynchronous
  -- outbox worker is temporarily unavailable. The outbox consumer repeats the
  -- reconciliation idempotently as recovery evidence.
  perform private.studio2_reconcile_all_organizer_tasks(null);

  v_result := jsonb_build_object(
    'ok', true,
    'riskClass', v_context ->> 'riskClass',
    'command', 'integrity.case_transition',
    'operationId', v_operation_id,
    'receiptId', v_operation_id,
    'eventId', v_event_id,
    'caseId', p_case_id,
    'publicCode', v_after.public_code,
    'previousStatus', v_before.status,
    'status', v_after.status,
    'previousVersion', v_version,
    'version', v_next_version,
    'closedAt', v_after.closed_at,
    'serverTime', statement_timestamp()
  );

  return private.studio2_complete_operation(v_operation_id, v_result);
end;
$apply$;

revoke all on function public.studio2_apply_integrity_case_transition(uuid, text, text, bigint, uuid, text)
  from public, anon;
grant execute on function public.studio2_apply_integrity_case_transition(uuid, text, text, bigint, uuid, text)
  to authenticated, service_role;

create or replace function public.studio2_process_integrity_domain_event(
  p_event_id uuid,
  p_consumer_key text,
  p_worker_id text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $process$
declare
  v_event private.v3_domain_events%rowtype;
  v_delivery private.v3_domain_event_outbox%rowtype;
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'integrity.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Integrity domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.* into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;
  if v_event.id is null or v_event.event_type <> 'integrity.case_changed' then
    raise exception 'Integrity consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.* into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;
  if v_delivery.event_id is null then
    raise exception 'Integrity domain event delivery was not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from private.v3_domain_event_consumer_receipts receipt
    where receipt.event_id = p_event_id
      and receipt.consumer_key = p_consumer_key
  ) then
    return public.studio2_complete_domain_event_delivery(
      p_event_id,
      p_consumer_key,
      p_worker_id,
      '{}'::jsonb
    );
  end if;

  if v_delivery.status <> 'processing'
     or v_delivery.lease_owner is distinct from p_worker_id
     or v_delivery.lease_expires_at <= now() then
    raise exception 'Integrity domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(null);
  v_task_notifications := private.studio2_sync_task_notifications(null);
  v_pruned_notifications := private.studio2_prune_stale_task_notifications(null);
  v_metadata := jsonb_build_object(
    'effect', 'integrity-task-reconciliation',
    'caseId', v_event.aggregate_id,
    'taskNotificationsChanged', v_task_notifications,
    'staleTaskNotificationsPruned', v_pruned_notifications
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end;
$process$;

revoke all on function public.studio2_process_integrity_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_integrity_domain_event(uuid, text, text)
  to service_role;

comment on function public.studio2_integrity_case_transition_preview(uuid, text) is
  'O13 exact-case Integrity lifecycle preflight with dependency/reviewer/conflict blockers and aggregate expected version.';
comment on function public.studio2_apply_integrity_case_transition(uuid, text, text, bigint, uuid, text) is
  'O13 versioned/idempotent Integrity lifecycle transition command with transactional legacy event, DomainEvent/outbox, audit and receipt evidence.';
comment on function public.studio2_process_integrity_domain_event(uuid, text, text) is
  'Service-role replay-safe consumer for integrity.tasks DomainEvent deliveries.';

notify pgrst, 'reload schema';
commit;
