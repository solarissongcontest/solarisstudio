begin;

-- System V3 / S14 archive consequence boundary.
--
-- Canonical lifecycle truth remains public.studio2_edition_runtime. The legacy
-- public.editions.status value is deliberately NOT independently rewritten here:
-- doing so would re-introduce two writable lifecycle authorities. Historical
-- clients may continue to read their compatibility value while all V3 lifecycle
-- decisions derive from studio2_edition_runtime.

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

  -- Resolve only work whose operation is impossible once the edition is
  -- archived. Governance/history work such as incidents and integrity cases is
  -- intentionally not blanket-resolved.
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

-- Keep the established aggregate reconciler as the one rebuild path. Domain
-- reconcilers may discover/reopen their normal tasks first; the final archive
-- pass deterministically resolves only now-impossible contest work before task
-- notifications are synchronized/pruned.
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
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- Preserve the single canonical browser-callable lifecycle authority while
-- adding durable operation/event provenance for the archive transition.
create or replace function public.studio2_transition_edition_v2(
  p_edition_id uuid,
  p_to text,
  p_reason text default null,
  p_approval_request_id uuid default null
)
returns public.studio2_edition_runtime
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $transition$
declare
  v_actor uuid := auth.uid();
  v_runtime public.studio2_edition_runtime%rowtype;
  v_status text;
  v_from text;
  v_risk text;
  v_reason text := nullif(btrim(p_reason), '');
  v_required_capability text;
  v_approval public.studio2_transition_approval_requests%rowtype;
  v_claim jsonb;
  v_operation_id uuid;
  v_operation_result jsonb;
begin
  if p_edition_id is null or p_to is null then
    raise exception 'Edition id and target state are required' using errcode = '22023';
  end if;

  v_required_capability := case
    when p_to = 'archived' then 'edition.archive'
    else 'edition.manage'
  end;

  if not public.studio2_access_allowed(v_required_capability, p_edition_id, false) then
    raise exception 'Missing Solaris capability: %', v_required_capability using errcode = '42501';
  end if;

  select * into v_runtime
  from public.studio2_edition_runtime
  where edition_id = p_edition_id
  for update;

  if not found then
    select e.status into v_status
    from public.editions e
    where e.id = p_edition_id;

    if not found then
      raise exception 'Edition not found: %', p_edition_id using errcode = 'P0002';
    end if;

    insert into public.studio2_edition_runtime (
      edition_id, state, subsystems, updated_by
    ) values (
      p_edition_id,
      private.studio2_normalize_legacy_edition_status(v_status),
      private.studio2_default_subsystems(private.studio2_normalize_legacy_edition_status(v_status)),
      v_actor
    )
    on conflict (edition_id) do nothing;

    select * into v_runtime
    from public.studio2_edition_runtime
    where edition_id = p_edition_id
    for update;
  end if;

  -- A lost-response retry of an already committed archive is semantically
  -- idempotent. It neither writes another legacy event nor emits another V3
  -- fact, and simply returns the current canonical runtime.
  if p_to = 'archived' and v_runtime.state = 'archived' then
    return v_runtime;
  end if;

  v_from := v_runtime.state;
  v_risk := private.studio2_transition_risk(v_from, p_to);

  if v_risk is null then
    raise exception 'Illegal edition state transition: % -> %', v_from, p_to using errcode = '22023';
  end if;

  if v_risk in ('elevated', 'critical') and v_reason is null then
    raise exception 'A reason is required for % edition transitions', v_risk using errcode = '22023';
  end if;

  if v_risk = 'critical' then
    if v_actor is null or p_approval_request_id is null then
      raise exception 'An approved second-person request is required for critical edition transitions'
        using errcode = '42501';
    end if;

    select * into v_approval
    from public.studio2_transition_approval_requests
    where id = p_approval_request_id
    for update;

    if not found
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
      raise exception 'Critical transition approval is missing, stale, mismatched, or already consumed'
        using errcode = '42501';
    end if;
  elsif p_approval_request_id is not null then
    raise exception 'Approval request ids are only valid for critical transitions' using errcode = '22023';
  end if;

  if p_to = 'archived' then
    if v_actor is null then
      raise exception 'Archive transition requires an authenticated actor for durable operation provenance'
        using errcode = '42501';
    end if;

    v_operation_id := gen_random_uuid();
    v_claim := private.studio2_claim_operation(
      v_operation_id,
      format('edition.archive:%s:%s', p_edition_id, v_runtime.version + 1),
      'edition.transition.archived',
      'R2',
      jsonb_build_object(
        'editionId', p_edition_id,
        'from', v_from,
        'to', p_to,
        'expectedRuntimeVersion', v_runtime.version
      )
    );

    if coalesce((v_claim ->> 'replayed')::boolean, false) then
      return v_runtime;
    end if;
    v_operation_id := (v_claim ->> 'operationId')::uuid;
  end if;

  update public.studio2_edition_runtime
  set state = p_to,
      subsystems = private.studio2_default_subsystems(p_to),
      version = version + 1,
      updated_by = v_actor
  where edition_id = p_edition_id
  returning * into v_runtime;

  if v_risk = 'critical' then
    update public.studio2_transition_approval_requests
    set consumed_at = now()
    where id = v_approval.id;
  end if;

  insert into public.studio2_contest_events (
    edition_id, type, actor_user_id, entity_type, entity_id, payload
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
      'operationId', v_operation_id,
      'runtimeVersion', v_runtime.version
    )
  );

  if p_to = 'archived' then
    insert into public.studio2_contest_events (
      edition_id, type, actor_user_id, entity_type, entity_id, payload
    ) values (
      p_edition_id,
      'edition.archived',
      v_actor,
      'edition',
      p_edition_id::text,
      jsonb_build_object(
        'from', v_from,
        'to', 'archived',
        'operationId', v_operation_id,
        'runtimeVersion', v_runtime.version
      )
    );

    v_operation_result := jsonb_build_object(
      'ok', true,
      'editionId', p_edition_id,
      'from', v_from,
      'state', v_runtime.state,
      'runtimeVersion', v_runtime.version,
      'operationId', v_operation_id
    );

    perform private.studio2_complete_operation(v_operation_id, v_operation_result);

    perform private.v3_emit_domain_event(
      'edition.archived',
      'edition',
      p_edition_id::text,
      v_runtime.version,
      v_operation_id,
      p_edition_id,
      null,
      jsonb_build_object(
        'from', v_from,
        'to', 'archived',
        'runtimeVersion', v_runtime.version,
        'legacyStatus', (select edition.status from public.editions edition where edition.id = p_edition_id),
        'lifecycleAuthority', 'studio2_edition_runtime'
      ),
      1,
      array['edition.tasks']::text[]
    );
  end if;

  return v_runtime;
end
$transition$;

revoke all on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  from public, anon;
grant execute on function public.studio2_transition_edition_v2(uuid, text, text, uuid)
  to authenticated, service_role;

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
  v_resolved integer := 0;
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
  v_resolved := private.v3_resolve_archived_edition_workflow_tasks(v_event.edition_id);
  perform private.studio2_sync_task_notifications(v_event.edition_id);
  perform private.studio2_prune_stale_task_notifications(v_event.edition_id);

  v_metadata := jsonb_build_object(
    'effect', 'archive-task-notification-reconciliation',
    'editionId', v_event.edition_id,
    'workflowTasksResolved', v_resolved,
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
