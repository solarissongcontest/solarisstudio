begin;

-- System V3 S5: Confirmation consequences become transactional DomainEvents.
--
-- Two already-canonical mutation paths meet here:
--   * participant submissions are accepted by v3_submit_confirmation and recorded
--     in private.v3_confirmation_operations;
--   * Organizer window mutations complete through studio2_operation_receipts.
--
-- Successful participant submissions are bridged into the shared S2 operation
-- receipt in the same transaction. A single S2-success trigger then emits the
-- completed fact into the S4 outbox. Existing legacy confirmation-operation rows
-- are intentionally not backfilled: S5 does not invent historical events.

create or replace function private.v3_bridge_confirmation_submission_operation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $bridge$
declare
  v_submission public.submissions%rowtype;
  v_submission_id uuid;
  v_scope jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
  v_actor uuid := auth.uid();
begin
  -- Failed/blocked submit attempts are not completed domain facts and therefore
  -- do not enter S4. The existing confirmation ledger still preserves their
  -- authoritative replay result.
  if not coalesce((new.result ->> 'ok')::boolean, false) then
    return new;
  end if;

  begin
    v_submission_id := nullif(new.result ->> 'submission_id', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Successful confirmation receipt has invalid submission identity'
      using errcode = '23514';
  end;

  if v_submission_id is null then
    raise exception 'Successful confirmation receipt lacks submission identity'
      using errcode = '23514';
  end if;

  select submission.*
  into v_submission
  from public.submissions submission
  where submission.id = v_submission_id;

  if v_submission.id is null
     or v_submission.round_id is distinct from new.round_id then
    raise exception 'Successful confirmation receipt does not match canonical submission scope'
      using errcode = '23514';
  end if;

  v_scope := jsonb_build_object(
    'roundId', v_submission.round_id,
    'editionId', v_submission.edition_id
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'confirmation.submit',
    'R1',
    v_scope,
    jsonb_build_object(
      'requestHash', new.request_hash,
      'browserSessionId', new.browser_session_id
    )
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
    status
  ) values (
    new.idempotency_key,
    v_actor,
    new.idempotency_key::text,
    new.idempotency_key,
    v_fingerprint,
    'confirmation.submit',
    'R1',
    v_scope,
    'processing'
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = new.idempotency_key
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Confirmation S2 operation receipt could not be persisted'
      using errcode = 'P0001';
  end if;

  if v_receipt.actor_id is distinct from v_actor
     or v_receipt.command is distinct from 'confirmation.submit'
     or v_receipt.idempotency_key is distinct from new.idempotency_key::text
     or v_receipt.correlation_id is distinct from new.idempotency_key
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope then
    raise exception 'IDEMPOTENCY_CONFLICT: confirmation operation identity is already used by different semantics'
      using errcode = 'P0001';
  end if;

  if v_receipt.status = 'processing' then
    update public.studio2_operation_receipts
    set status = 'succeeded',
        result = jsonb_build_object(
          'ok', true,
          'submissionId', v_submission.id,
          'roundId', v_submission.round_id,
          'editionId', v_submission.edition_id,
          'editCount', v_submission.edit_count
        ),
        error_code = null,
        error_metadata = null,
        completed_at = now(),
        updated_at = now()
    where operation_id = v_receipt.operation_id;
  elsif v_receipt.status <> 'succeeded' then
    raise exception 'Confirmation operation is not in a completable state'
      using errcode = '55000';
  end if;

  return new;
end
$bridge$;

revoke all on function private.v3_bridge_confirmation_submission_operation()
  from public, anon, authenticated;

drop trigger if exists v3_bridge_confirmation_submission_operation
  on private.v3_confirmation_operations;
create trigger v3_bridge_confirmation_submission_operation
after insert on private.v3_confirmation_operations
for each row execute function private.v3_bridge_confirmation_submission_operation();

create or replace function private.v3_emit_confirmation_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_round_id uuid;
  v_submission_id uuid;
  v_edition_id uuid;
  v_version bigint;
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_payload jsonb;
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command = 'confirmation.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
      v_version := nullif(new.result ->> 'editCount', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed confirmation submission operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_submission_id is null or v_round_id is null or v_version is null then
      raise exception 'Completed confirmation submission operation lacks event provenance'
        using errcode = '23514';
    end if;

    v_event_type := 'confirmation.submitted';
    v_aggregate_type := 'confirmation_submission';
    v_aggregate_id := v_submission_id::text;
    v_payload := jsonb_build_object(
      'submissionId', v_submission_id,
      'roundId', v_round_id,
      'editCount', v_version
    );

  elsif new.command like 'confirmation.round.%' then
    begin
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed confirmation round operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_round_id is null or v_version is null then
      raise exception 'Completed confirmation round operation lacks event provenance'
        using errcode = '23514';
    end if;

    select round.edition_id
    into v_edition_id
    from public.submission_rounds round
    where round.id = v_round_id;

    if v_edition_id is null then
      begin
        v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      exception when invalid_text_representation then
        v_edition_id := null;
      end;
    end if;

    v_event_type := 'confirmation.window_changed';
    v_aggregate_type := 'confirmation_round';
    v_aggregate_id := v_round_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'changeKind', new.result ->> 'changeKind',
      'status', new.result ->> 'status',
      'editingEnabled', new.result -> 'editingEnabled',
      'affectedResponses', new.result -> 'affectedResponses'
    ));
  else
    return new;
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    v_aggregate_type,
    v_aggregate_id,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    array['confirmation.tasks', 'confirmation.notifications']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_confirmation_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_confirmation_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_confirmation_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_confirmation_operation_event();

-- Process one claimed Confirmation consequence and complete its S4 delivery in
-- the same transaction. If lease validation/completion fails, all reconciler
-- effects roll back with it and the delivery can be safely reclaimed.
create or replace function public.studio2_process_confirmation_domain_event(
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
  v_sync_changes integer := 0;
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
  v_delivery_candidates integer := 0;
  v_metadata jsonb := '{}'::jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key not in ('confirmation.tasks', 'confirmation.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Confirmation domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('confirmation.submitted', 'confirmation.window_changed') then
    raise exception 'Confirmation consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Confirmation domain event delivery was not found'
      using errcode = 'P0002';
  end if;

  -- Completed consumers are replay-safe and must not execute their consequence
  -- a second time. The S4 completion RPC records replay semantics.
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
    raise exception 'Confirmation domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'confirmation.tasks' then
    perform private.studio2_reconcile_confirmation_requirement_tasks(v_event.edition_id);
    v_sync_changes := private.studio2_reconcile_confirmation_sync_tasks();
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'confirmation-task-reconciliation',
      'syncTaskChanges', v_sync_changes,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'confirmation-notification-evaluation',
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

revoke all on function public.studio2_process_confirmation_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_confirmation_domain_event(uuid, text, text)
  to service_role;

commit;
