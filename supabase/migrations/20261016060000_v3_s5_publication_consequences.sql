begin;

-- System V3 S5: publication state changes and scheduled-publication failures
-- become explicit DomainEvents. Existing publication commands/scheduler remain
-- authoritative; this migration only bridges their committed facts into S4.
--
-- A scheduled publication request and the later scheduler execution are distinct
-- operations in one causal chain. The execution therefore owns its own operation
-- id while inheriting correlation/actor/risk evidence from the scheduling
-- operation when that provenance exists.

create or replace function private.v3_emit_publication_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_show_id uuid;
  v_edition_id uuid;
  v_state text;
  v_version bigint;
  v_results_public boolean := false;
  v_consumers text[] := array['publication.tasks']::text[];
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command <> 'publication.show.change' then
    return new;
  end if;

  begin
    v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
  exception when invalid_text_representation then
    raise exception 'Completed publication operation has invalid event provenance'
      using errcode = '23514';
  end;
  v_state := nullif(btrim(coalesce(new.result ->> 'state', '')), '');

  select control.edition_id,
         coalesce((control.frozen_config ->> 'results')::boolean, false)
  into v_edition_id, v_results_public
  from public.studio2_show_publication_controls control
  where control.show_id = v_show_id
    and control.version = v_version
    and control.state = v_state;

  if v_show_id is null
     or v_edition_id is null
     or v_state is null
     or v_version is null then
    raise exception 'Completed publication operation does not match canonical publication state'
      using errcode = '23514';
  end if;

  if v_state = 'public' and v_results_public then
    v_consumers := array['publication.tasks', 'publication.notifications']::text[];
  end if;

  perform private.v3_emit_domain_event(
    'publication.changed',
    'publication',
    v_show_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    v_show_id,
    jsonb_build_object(
      'showId', v_show_id,
      'state', v_state,
      'version', v_version
    ),
    1,
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_publication_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_publication_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_publication_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_publication_operation_event();

create or replace function private.v3_emit_scheduled_publication_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_control public.studio2_show_publication_controls%rowtype;
  v_parent public.studio2_operation_receipts%rowtype;
  v_operation public.studio2_operation_receipts%rowtype;
  v_scope jsonb;
  v_fingerprint text;
  v_risk text := 'R2';
  v_correlation_id uuid := new.id;
  v_actor_id uuid;
  v_event_type text;
  v_consumers text[] := array['publication.tasks']::text[];
begin
  if new.id is null or new.show_id is null or new.edition_id is null then
    raise exception 'Scheduled publication execution lacks canonical identity'
      using errcode = '23514';
  end if;

  select control.*
  into v_control
  from public.studio2_show_publication_controls control
  where control.show_id = new.show_id;

  if v_control.show_id is null
     or v_control.edition_id is distinct from new.edition_id then
    raise exception 'Scheduled publication execution is outside canonical publication scope'
      using errcode = '23514';
  end if;

  if new.scheduled_operation_id is not null then
    select receipt.*
    into v_parent
    from public.studio2_operation_receipts receipt
    where receipt.operation_id = new.scheduled_operation_id;

    if v_parent.operation_id is null
       or v_parent.command is distinct from 'publication.show.change'
       or v_parent.status <> 'succeeded' then
      raise exception 'Scheduled publication execution lacks valid scheduling provenance'
        using errcode = '23514';
    end if;

    v_actor_id := v_parent.actor_id;
    v_correlation_id := v_parent.correlation_id;
    v_risk := coalesce(v_parent.risk_class, 'R2');
  end if;

  v_scope := jsonb_build_object(
    'editionId', new.edition_id,
    'showId', new.show_id
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'publication.show.execute',
    v_risk,
    v_scope,
    jsonb_strip_nulls(jsonb_build_object(
      'executionId', new.id,
      'scheduledOperationId', new.scheduled_operation_id,
      'status', new.status,
      'sourceShowUpdatedAt', new.source_show_updated_at,
      'sourceResultVersion', new.source_result_version
    ))
  );

  insert into public.studio2_operation_receipts (
    operation_id,
    actor_id,
    idempotency_key,
    correlation_id,
    request_fingerprint,
    command,
    risk_class,
    scope,
    status,
    result,
    completed_at
  ) values (
    new.id,
    v_actor_id,
    new.id::text,
    v_correlation_id,
    v_fingerprint,
    'publication.show.execute',
    v_risk,
    v_scope,
    'succeeded',
    jsonb_strip_nulls(jsonb_build_object(
      'ok', true,
      'executionId', new.id,
      'scheduledOperationId', new.scheduled_operation_id,
      'editionId', new.edition_id,
      'showId', new.show_id,
      'status', new.status
    )),
    new.executed_at
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_operation
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = new.id
  for update;

  if v_operation.operation_id is null
     or v_operation.actor_id is distinct from v_actor_id
     or v_operation.command is distinct from 'publication.show.execute'
     or v_operation.idempotency_key is distinct from new.id::text
     or v_operation.correlation_id is distinct from v_correlation_id
     or v_operation.request_fingerprint is distinct from v_fingerprint
     or v_operation.scope is distinct from v_scope
     or v_operation.status <> 'succeeded' then
    raise exception 'IDEMPOTENCY_CONFLICT: scheduled publication execution identity has different semantics'
      using errcode = '23505';
  end if;

  if new.status = 'succeeded' then
    if v_control.state <> 'public' then
      raise exception 'Successful scheduled publication did not produce canonical public state'
        using errcode = '23514';
    end if;
    v_event_type := 'publication.changed';
    if coalesce((v_control.frozen_config ->> 'results')::boolean, false) then
      v_consumers := array['publication.tasks', 'publication.notifications']::text[];
    end if;
  elsif new.status = 'blocked' then
    v_event_type := 'publication.failed';
  else
    raise exception 'Unsupported scheduled publication execution status'
      using errcode = '23514';
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    'publication',
    new.show_id::text,
    v_control.version,
    new.id,
    new.edition_id,
    new.show_id,
    jsonb_strip_nulls(jsonb_build_object(
      'executionId', new.id,
      'scheduledOperationId', new.scheduled_operation_id,
      'showId', new.show_id,
      'state', v_control.state,
      'version', v_control.version,
      'executionStatus', new.status,
      'failureCode', case
        when new.status = 'blocked' then 'PUBLICATION_REVALIDATION_BLOCKED'
      end
    )),
    1,
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_scheduled_publication_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_scheduled_publication_event
  on public.studio2_show_publication_executions;
create trigger v3_emit_scheduled_publication_event
after insert on public.studio2_show_publication_executions
for each row
execute function private.v3_emit_scheduled_publication_event();

create or replace function public.studio2_process_publication_domain_event(
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
  v_delivery_candidates integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key not in ('publication.tasks', 'publication.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Publication domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('publication.changed', 'publication.failed') then
    raise exception 'Publication consumer received an unsupported domain event'
      using errcode = '22023';
  end if;
  if p_consumer_key = 'publication.notifications'
     and v_event.event_type <> 'publication.changed' then
    raise exception 'Publication notification consumer only accepts publication.changed'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Publication domain event delivery was not found'
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
    raise exception 'Publication domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'publication.tasks' then
    perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'publication-task-reconciliation',
      'editionId', v_event.edition_id,
      'showId', v_event.show_id,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'published-result-notification-evaluation',
      'editionId', v_event.edition_id,
      'showId', v_event.show_id,
      'deliveryCandidatesInserted', v_delivery_candidates
    );
  end if;

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_publication_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_publication_domain_event(uuid, text, text)
  to service_role;

commit;
