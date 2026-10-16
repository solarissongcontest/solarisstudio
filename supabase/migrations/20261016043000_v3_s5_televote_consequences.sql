begin;

-- System V3 S5: Televote consequences become transactional DomainEvents.
--
-- Preserve the existing public ballot authority and Organizer round-state
-- commands. Public ballots remain accepted only by submit_vote_checked after a
-- one-shot integrity preflight; Organizer round transitions remain the existing
-- idempotent R2 operations. This migration bridges those completed facts into
-- the shared S2 receipt + S4 event/outbox contract without creating another
-- voting write model or exposing ballot contents in event payloads.

create or replace function private.v3_bridge_televote_submission_operation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, extensions
as $bridge$
declare
  v_submission televoting.vote_submissions%rowtype;
  v_operation_id uuid;
  v_edition_id uuid;
  v_scope jsonb;
  v_fingerprint text;
  v_receipt public.studio2_operation_receipts%rowtype;
begin
  if new.channel <> 'televote'
     or new.submission_id is null
     or new.submitted_at is null
     or old.submission_id is not distinct from new.submission_id then
    return new;
  end if;

  select submission.*
  into v_submission
  from televoting.vote_submissions submission
  where submission.id = new.submission_id
    and submission.round_id is not distinct from new.round_id
    and submission.username_normalized is not distinct from new.username_normalized
    and upper(submission.country_code) is not distinct from upper(new.country_code)
    and not submission.is_historical;

  if v_submission.id is null then
    raise exception 'Completed Televote preflight does not match canonical ballot state'
      using errcode = '23514';
  end if;

  select link.solaris_id
  into v_edition_id
  from public.integration_links link
  join televoting.rounds round_row
    on round_row.id = new.round_id
   and link.remote_id = round_row.edition_id::text
  where link.service = 'televoting'
    and link.entity_type = 'edition'
  limit 1;

  if v_edition_id is null then
    raise exception 'Completed Televote ballot is not linked to a canonical Solaris edition'
      using errcode = '23514';
  end if;

  -- Recovery is deliberately additive. When a recovery handle exists its stable
  -- operation identity becomes the cross-system operation identity. If recovery
  -- creation failed before submission, the one-shot preflight UUID is already a
  -- deterministic idempotency identity and safely fills that role.
  select handle.operation_id
  into v_operation_id
  from private.v3_televote_recovery_handles handle
  where handle.preflight_id = new.id;

  v_operation_id := coalesce(v_operation_id, new.id);
  v_scope := jsonb_build_object(
    'roundId', new.round_id,
    'editionId', v_edition_id
  );
  v_fingerprint := private.studio2_request_fingerprint(
    'televote.submit',
    'R1',
    v_scope,
    jsonb_build_object(
      'preflightId', new.id,
      'submissionId', v_submission.id
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
    v_operation_id,
    auth.uid(),
    v_operation_id::text,
    v_operation_id,
    v_fingerprint,
    'televote.submit',
    'R1',
    v_scope,
    'processing'
  )
  on conflict (operation_id) do nothing;

  select receipt.*
  into v_receipt
  from public.studio2_operation_receipts receipt
  where receipt.operation_id = v_operation_id
  for update;

  if v_receipt.operation_id is null then
    raise exception 'Televote S2 operation receipt could not be persisted'
      using errcode = 'P0001';
  end if;

  if v_receipt.actor_id is distinct from auth.uid()
     or v_receipt.command is distinct from 'televote.submit'
     or v_receipt.idempotency_key is distinct from v_operation_id::text
     or v_receipt.correlation_id is distinct from v_operation_id
     or v_receipt.request_fingerprint is distinct from v_fingerprint
     or v_receipt.scope is distinct from v_scope then
    raise exception 'IDEMPOTENCY_CONFLICT: Televote operation identity is already used by different semantics'
      using errcode = 'P0001';
  end if;

  if v_receipt.status = 'processing' then
    update public.studio2_operation_receipts
    set status = 'succeeded',
        result = jsonb_build_object(
          'ok', true,
          'submissionId', v_submission.id,
          'roundId', v_submission.round_id,
          'editionId', v_edition_id,
          'preflightId', new.id,
          'status', v_submission.status
        ),
        error_code = null,
        error_metadata = null,
        completed_at = now(),
        updated_at = now()
    where operation_id = v_operation_id;
  elsif v_receipt.status <> 'succeeded' then
    raise exception 'Televote operation is not in a completable state'
      using errcode = '55000';
  end if;

  return new;
end
$bridge$;

revoke all on function private.v3_bridge_televote_submission_operation()
  from public, anon, authenticated;

drop trigger if exists v3_bridge_televote_submission_operation
  on televoting.vote_preflight_checks;
create trigger v3_bridge_televote_submission_operation
after update of submission_id, submitted_at on televoting.vote_preflight_checks
for each row
when (
  old.submission_id is distinct from new.submission_id
  and new.submission_id is not null
  and new.submitted_at is not null
)
execute function private.v3_bridge_televote_submission_operation();

create or replace function private.v3_emit_televote_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $emit$
declare
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_aggregate_version bigint;
  v_edition_id uuid;
  v_round_id uuid;
  v_submission_id uuid;
  v_preflight_id uuid;
  v_payload jsonb := '{}'::jsonb;
  v_consumers text[] := array['televote.tasks']::text[];
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command in ('televote.round.open', 'televote.round.closed') then
    begin
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.scope ->> 'solarisEditionId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'roundVersion', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Televote round operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_round_id is null or v_edition_id is null or v_aggregate_version is null then
      raise exception 'Completed Televote round operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.rounds round_row
      join public.integration_links link
        on link.service = 'televoting'
       and link.entity_type = 'edition'
       and link.remote_id = round_row.edition_id::text
       and link.solaris_id = v_edition_id
      where round_row.id = v_round_id
    ) then
      raise exception 'Completed Televote round operation is outside canonical edition scope'
        using errcode = '23514';
    end if;

    v_event_type := case
      when new.command = 'televote.round.open' then 'televote.opened'
      else 'televote.closed'
    end;
    v_aggregate_type := 'televote_round';
    v_aggregate_id := v_round_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'roundId', v_round_id,
      'status', new.result ->> 'status',
      'previousGlobalVersion', new.result -> 'previousGlobalVersion',
      'globalVersion', new.result -> 'globalVersion',
      'previousRoundVersion', new.result -> 'previousRoundVersion',
      'roundVersion', new.result -> 'roundVersion'
    ));

    if v_event_type = 'televote.opened' then
      v_consumers := array['televote.tasks', 'televote.notifications']::text[];
    end if;

  elsif new.command = 'televote.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_round_id := nullif(new.result ->> 'roundId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
      v_preflight_id := nullif(new.result ->> 'preflightId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed Televote submission operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_submission_id is null
       or v_round_id is null
       or v_edition_id is null
       or v_preflight_id is null then
      raise exception 'Completed Televote submission operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from televoting.vote_submissions submission
      join televoting.vote_preflight_checks preflight
        on preflight.id = v_preflight_id
       and preflight.channel = 'televote'
       and preflight.submission_id = submission.id
       and preflight.round_id = submission.round_id
      join televoting.rounds round_row on round_row.id = submission.round_id
      join public.integration_links link
        on link.service = 'televoting'
       and link.entity_type = 'edition'
       and link.remote_id = round_row.edition_id::text
       and link.solaris_id = v_edition_id
      where submission.id = v_submission_id
        and submission.round_id = v_round_id
        and not submission.is_historical
    ) then
      raise exception 'Completed Televote submission does not match canonical ballot/preflight scope'
        using errcode = '23514';
    end if;

    v_event_type := 'televote.ballot_submitted';
    v_aggregate_type := 'televote_ballot';
    v_aggregate_id := v_submission_id::text;
    v_aggregate_version := 0;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'submissionId', v_submission_id,
      'roundId', v_round_id,
      'preflightId', v_preflight_id,
      'status', new.result ->> 'status'
    ));
  else
    return new;
  end if;

  perform private.v3_emit_domain_event(
    v_event_type,
    v_aggregate_type,
    v_aggregate_id,
    v_aggregate_version,
    new.operation_id,
    v_edition_id,
    null,
    v_payload,
    1,
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_televote_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_televote_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_televote_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_televote_operation_event();

create or replace function public.studio2_process_televote_domain_event(
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
     or p_consumer_key not in ('televote.tasks', 'televote.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Televote domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in (
       'televote.opened',
       'televote.closed',
       'televote.ballot_submitted'
     ) then
    raise exception 'Televote consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  if p_consumer_key = 'televote.notifications'
     and v_event.event_type <> 'televote.opened' then
    raise exception 'Televote notification consumer only accepts televote.opened'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Televote domain event delivery was not found'
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
    raise exception 'Televote domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'televote.tasks' then
    perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'televote-task-reconciliation',
      'editionId', v_event.edition_id,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'televote-open-notification-evaluation',
      'editionId', v_event.edition_id,
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

revoke all on function public.studio2_process_televote_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_televote_domain_event(uuid, text, text)
  to service_role;

commit;
