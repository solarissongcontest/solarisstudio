begin;

-- Solaris Studio V3 / S14: canonical archive transition + consequence
-- reconciliation, adopted through the S13 migration-hardening framework.
--
-- Canonical lifecycle authority is public.studio2_edition_runtime. The legacy
-- public.editions.status column remains compatibility/catalog metadata and is
-- deliberately not independently rewritten by V3 lifecycle mutations.
--
-- Show-scoped Jury, Televote and Results lifecycles are orthogonal V3 domains.
-- A multi-show edition may reconcile its coarse edition runtime to `results`
-- only after canonical Grand Final publication points at retained immutable
-- result evidence. Archive itself remains strictly results -> post_edition ->
-- archived.

insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-consequence-reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'Adds the governed edition lifecycle command, final-publication runtime reconciliation, archive DomainEvent/outbox consequence path, and archive-aware task/notification reconciliation. Existing historical result, notification, task, and receipt evidence is retained; rollback should repair forward once clients adopt the V3 lifecycle authority.'
)
on conflict (migration_key) do nothing;

-- ---------------------------------------------------------------------------
-- Archive-aware Organizer work reconciliation
-- ---------------------------------------------------------------------------

create or replace function private.v3_resolve_archived_edition_workflow_tasks(
  p_edition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $resolve$
declare
  v_resolved integer := 0;
begin
  if p_edition_id is null then
    return 0;
  end if;

  if not exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = p_edition_id
      and runtime.state = 'archived'
  ) then
    return 0;
  end if;

  -- Resolve only current-contest operational work whose underlying mutation is
  -- impossible after Archive. Governance/history work (for example incidents
  -- or integrity investigations) is intentionally not blanket-resolved.
  update public.studio2_organizer_tasks task
  set state = 'resolved',
      resolved_at = coalesce(task.resolved_at, now()),
      last_evaluated_at = now(),
      updated_at = now()
  where task.edition_id = p_edition_id
    and task.state <> 'resolved'
    and task.task_type ~ '^(confirmation|entry|media|participation|jury|televote|results|publication|show|broadcast|edition\.(transition|subsystem))\.';

  get diagnostics v_resolved = row_count;
  return v_resolved;
end
$resolve$;

revoke all on function private.v3_resolve_archived_edition_workflow_tasks(uuid)
  from public, anon, authenticated;

create or replace function private.v3_reconcile_resolved_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
begin
  -- Historical Inbox evidence remains. Only its current-action claim is ended.
  update public.admin_notifications notification
  set resolved_at = coalesce(notification.resolved_at, task.resolved_at, now()),
      requires_action = false
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is null
      or notification.requires_action
    );

  get diagnostics v_changed = row_count;
  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

-- Keep the existing domain reconcilers as the one rebuild path. They may
-- rediscover ordinary work first; Archive is applied last so impossible current
-- contest work cannot resurrect. Notifications are then synchronized and stale
-- deliveries are suppressed by the existing delivery-safety reconciler.
create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_repair_jury_missing_ballot_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_reconcile_system_job_tasks();
  perform private.studio2_reconcile_jury_ballot_review_tasks(p_edition_id);
  perform private.studio2_reconcile_confirmation_sync_tasks();

  if p_edition_id is not null then
    perform private.v3_resolve_archived_edition_workflow_tasks(p_edition_id);
  else
    perform private.v3_resolve_archived_edition_workflow_tasks(runtime.edition_id)
    from public.studio2_edition_runtime runtime
    where runtime.state = 'archived';
  end if;

  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.v3_reconcile_resolved_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- One lifecycle authority + archive guard
-- ---------------------------------------------------------------------------

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if new.state = 'archived'
     and old.state is distinct from 'archived'
     and coalesce(current_setting('solaris.v3_archive_command', true), '') <> 'allowed' then
    raise exception 'Archive transition must use the canonical V3 lifecycle command.'
      using errcode = '42501';
  end if;
  return new;
end
$guard$;

revoke all on function private.v3_guard_archive_runtime_transition()
  from public, anon, authenticated;

drop trigger if exists v3_guard_archive_runtime_transition
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_transition
before update of state on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

-- Grand Final publication is the canonical cross-domain prerequisite for
-- reconciling the coarse edition runtime to results. Every final-like show must
-- have a public publication control pointing to retained, non-empty immutable
-- result evidence.
create or replace function private.v3_edition_final_results_ready(
  p_edition_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $ready$
  with final_shows as (
    select show_row.id
    from public.shows show_row
    where show_row.edition_id = p_edition_id
      and lower(replace(replace(coalesce(show_row.kind, ''), '_', '-'), ' ', '-'))
          in ('grand-final', 'final')
  )
  select
    exists (select 1 from final_shows)
    and not exists (
      select 1
      from final_shows final_show
      where not exists (
        select 1
        from public.studio2_show_publication_controls control
        join private.v3_result_versions result_version
          on result_version.show_id = control.show_id
         and result_version.version = control.source_result_version
         and result_version.edition_id = control.edition_id
        where control.show_id = final_show.id
          and control.edition_id = p_edition_id
          and control.state = 'public'
          and control.source_result_version is not null
          and result_version.result_row_count > 0
      )
    )
$ready$;

revoke all on function private.v3_edition_final_results_ready(uuid)
  from public, anon, authenticated;

-- Canonical browser-callable V3 lifecycle mutation authority.
create or replace function public.studio2_transition_edition_v3(
  p_edition_id uuid,
  p_to text,
  p_reason text,
  p_approval_request_id uuid,
  p_expected_version bigint,
  p_operation_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $transition$
declare
  v_actor uuid := auth.uid();
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_required_capability text;
  v_claim_risk text;
  v_claim jsonb;
  v_runtime public.studio2_edition_runtime%rowtype;
  v_from text;
  v_risk text;
  v_reconciled_final_results boolean := false;
  v_approval public.studio2_transition_approval_requests%rowtype;
  v_result jsonb;
  v_server_time timestamptz;
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION';
  end if;
  if p_edition_id is null
     or nullif(btrim(coalesce(p_to, '')), '') is null
     or p_expected_version is null
     or p_expected_version < 1
     or p_operation_id is null
     or v_key is null then
    raise exception using errcode = '22023', message = 'VALIDATION';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, false) then
    raise exception using errcode = '42501', message = 'AUTHORIZATION';
  end if;

  v_claim_risk := case when p_approval_request_id is null then 'R2' else 'R3' end;

  -- Claim before evaluating mutable runtime state so an exact retry after a
  -- committed transition returns the original receipt instead of re-executing
  -- against already-advanced state. The S2 fingerprint binds semantic request.
  v_claim := private.studio2_claim_operation(
    p_operation_id,
    v_key,
    p_operation_id,
    'edition.transition',
    v_claim_risk,
    jsonb_build_object('editionId', p_edition_id),
    jsonb_build_object(
      'to', p_to,
      'reason', v_reason,
      'approvalRequestId', p_approval_request_id,
      'expectedRuntimeVersion', p_expected_version
    )
  );

  if coalesce((v_claim ->> 'replayed')::boolean, false) then
    if v_claim ->> 'status' = 'succeeded' and v_claim -> 'result' is not null then
      return (v_claim -> 'result') || jsonb_build_object('replayed', true);
    end if;
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = 'Edition transition operation exists but is not in a replayable succeeded state.';
  end if;

  select runtime.*
  into v_runtime
  from public.studio2_edition_runtime runtime
  where runtime.edition_id = p_edition_id
  for update;

  if v_runtime.edition_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'STATE_CHANGED',
      detail = 'Canonical edition runtime does not exist.';
  end if;

  if v_runtime.version is distinct from p_expected_version then
    raise exception using
      errcode = '40001',
      message = 'VERSION_CONFLICT',
      detail = format(
        'Expected edition runtime version %s, current version is %s.',
        p_expected_version,
        v_runtime.version
      ),
      hint = 'Reload the Control Room and review the current lifecycle state before trying again.';
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  -- V3 does not encode every show-level Jury/Televote/Results cycle into the
  -- edition runtime. Allow one reconciliation edge only when final publication
  -- proves the edition genuinely reached Results. This cannot move
  -- post_edition/archive backwards and cannot run without immutable final data.
  if v_risk is null
     and p_to = 'results'
     and v_from in (
       'submissions',
       'pre_show',
       'rehearsals',
       'jury_voting',
       'live_show',
       'televoting',
       'vote_verification'
     )
     and private.v3_edition_final_results_ready(p_edition_id) then
    v_risk := 'normal';
    v_reconciled_final_results := true;
  end if;

  if v_risk is null then
    raise exception using
      errcode = '40001',
      message = 'STATE_CHANGED',
      detail = format('Edition cannot transition from %s to %s.', v_from, p_to);
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = format('A reason is required for %s edition transitions.', v_risk);
  end if;

  if v_risk = 'critical' then
    if p_approval_request_id is null then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'An approved second-person request is required for critical edition transitions.';
    end if;

    select approval.*
    into v_approval
    from public.studio2_transition_approval_requests approval
    where approval.id = p_approval_request_id
    for update;

    if v_approval.id is null
       or v_approval.edition_id <> p_edition_id
       or v_approval.from_state <> v_from
       or v_approval.to_state <> p_to
       or v_approval.requested_by <> v_actor
       or v_approval.approved_by is null
       or v_approval.approved_by = v_actor
       or v_approval.approved_at is null
       or v_approval.consumed_at is not null
       or v_approval.expires_at <= now()
       or v_approval.reason <> v_reason then
      raise exception using
        errcode = '42501',
        message = 'AUTHORIZATION',
        detail = 'Critical transition approval is missing, stale, mismatched, or already consumed.';
    end if;
  elsif p_approval_request_id is not null then
    raise exception using
      errcode = '22023',
      message = 'VALIDATION',
      detail = 'Approval request ids are only valid for critical transitions.';
  end if;

  if p_to = 'archived' then
    perform set_config('solaris.v3_archive_command', 'allowed', true);
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
    and version = p_expected_version
  returning * into v_runtime;

  if v_runtime.edition_id is null then
    raise exception using errcode = '40001', message = 'VERSION_CONFLICT';
  end if;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id
      and consumed_at is null;

    if not found then
      raise exception using errcode = '40001', message = 'STATE_CHANGED';
    end if;
  end if;

  v_server_time := clock_timestamp();

  insert into public.studio2_contest_events (
    edition_id,
    type,
    actor_user_id,
    entity_type,
    entity_id,
    payload
  ) values (
    p_edition_id,
    'edition.state_changed',
    v_actor,
    'edition',
    p_edition_id::text,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'operationId', p_operation_id,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version,
      'reconciledFromFinalPublication', v_reconciled_final_results
    )
  );

  if p_to = 'archived' then
    insert into public.studio2_contest_events (
      edition_id,
      type,
      actor_user_id,
      entity_type,
      entity_id,
      payload
    ) values (
      p_edition_id,
      'edition.archived',
      v_actor,
      'edition',
      p_edition_id::text,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'operationId', p_operation_id,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version
      )
    );
  end if;

  v_result := jsonb_build_object(
    'ok', true,
    'operationId', p_operation_id,
    'editionId', p_edition_id,
    'from', v_from,
    'previousRuntimeVersion', p_expected_version,
    'state', v_runtime.state,
    'runtimeVersion', v_runtime.version,
    'serverTime', v_server_time,
    'replayed', false,
    'reconciledFromFinalPublication', v_reconciled_final_results,
    'runtime', to_jsonb(v_runtime)
  );

  perform private.studio2_complete_operation(p_operation_id, v_result);

  perform private.v3_emit_domain_event(
    'edition.state_changed',
    'edition',
    p_edition_id::text,
    v_runtime.version,
    p_operation_id,
    p_edition_id,
    null,
    jsonb_build_object(
      'from', v_from,
      'to', p_to,
      'risk', v_risk,
      'reason', v_reason,
      'approvalRequestId', case when v_risk = 'critical' then v_approval.id else null end,
      'secondApproverUserId', case when v_risk = 'critical' then v_approval.approved_by else null end,
      'previousRuntimeVersion', p_expected_version,
      'runtimeVersion', v_runtime.version,
      'reconciledFromFinalPublication', v_reconciled_final_results,
      'lifecycleAuthority', 'studio2_edition_runtime'
    ),
    1,
    array[]::text[]
  );

  if p_to = 'archived' then
    perform private.v3_emit_domain_event(
      'edition.archived',
      'edition',
      p_edition_id::text,
      v_runtime.version,
      p_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'from', v_from,
        'to', p_to,
        'previousRuntimeVersion', p_expected_version,
        'runtimeVersion', v_runtime.version,
        'legacyStatus', (
          select edition.status
          from public.editions edition
          where edition.id = p_edition_id
        ),
        'lifecycleAuthority', 'studio2_edition_runtime'
      ),
      1,
      array['edition.tasks']::text[]
    );
  end if;

  return v_result;
end
$transition$;

-- V3 is now the only browser-callable edition lifecycle mutation authority.
-- The legacy RPC remains service-role readable for compatibility/recovery, but
-- its Archive update is also fenced by the runtime trigger above.
revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  to service_role;

revoke all on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) from public, anon;
grant execute on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) to authenticated, service_role;

comment on function private.v3_edition_final_results_ready(uuid) is
  'True only when every Grand Final/final show for the edition has public publication control pointing to retained non-empty immutable V3 result evidence.';

comment on function public.studio2_transition_edition_v3(
  uuid, text, text, uuid, bigint, uuid, text
) is
  'Canonical V3 edition lifecycle mutation authority. Requires reviewed runtime version plus stable operation/idempotency identity; may reconcile coarse runtime to results only after authoritative Grand Final publication; returns a durable reconciliable receipt result.';

-- ---------------------------------------------------------------------------
-- Archive DomainEvent consumer
-- ---------------------------------------------------------------------------

create or replace function public.studio2_process_edition_domain_event(
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
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  if p_event_id is null
     or p_consumer_key <> 'edition.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid edition domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null or v_event.event_type <> 'edition.archived' then
    raise exception 'Edition consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Edition domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from private.v3_domain_event_consumer_receipts receipt
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
    raise exception 'Edition domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);

  v_metadata := jsonb_build_object(
    'effect', 'archive-task-notification-reconciliation',
    'editionId', v_event.edition_id,
    'runtimeState', 'archived'
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_edition_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_edition_domain_event(uuid, text, text)
  to service_role;

notify pgrst, 'reload schema';

commit;
