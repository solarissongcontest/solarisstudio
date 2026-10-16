begin;

-- System V3 S5: Jury consequences become transactional DomainEvents.
--
-- Existing Organizer Jury commands already own authorization, optimistic
-- concurrency, idempotency, locking, audit evidence and durable operation
-- receipts. This migration keeps those mutation owners and attaches completed
-- facts plus explicit, replay-safe consequence consumers at the shared S2
-- success boundary. No historical operation is backfilled into a synthetic
-- event: S5 records facts only when the authoritative command actually commits.

create or replace function private.v3_emit_jury_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_aggregate_version bigint;
  v_edition_id uuid;
  v_show_id uuid;
  v_ballot_id uuid;
  v_voter_id uuid;
  v_voter_country_id uuid;
  v_voter_entity_id uuid;
  v_payload jsonb := '{}'::jsonb;
  v_consumers text[] := array['jury.tasks']::text[];
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  -- Jury window operations already complete through studio2_operation_receipts.
  -- Their edition/show scope is immutable command metadata and the resulting
  -- edition window version is the aggregate version.
  if new.command in ('jury.window.open', 'jury.window.closed') then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Jury window operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null or v_show_id is null or v_aggregate_version is null then
      raise exception 'Completed Jury window operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.shows show_row
      where show_row.id = v_show_id
        and show_row.edition_id = v_edition_id
    ) then
      raise exception 'Completed Jury window operation is outside canonical show scope'
        using errcode = '23514';
    end if;

    v_event_type := case
      when new.command = 'jury.window.open' then 'jury.opened'
      else 'jury.closed'
    end;
    v_aggregate_type := 'jury_window';
    v_aggregate_id := v_show_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'showId', v_show_id,
      'status', new.scope ->> 'requestedStatus',
      'previousVersion', new.result -> 'previousVersion',
      'version', new.result -> 'version'
    ));

    if v_event_type = 'jury.opened' then
      v_consumers := array['jury.tasks', 'jury.notifications']::text[];
    end if;

  -- Organizer ballot review is an exact-version R2 command. The review row is
  -- canonical evidence; payloads intentionally contain only lifecycle metadata,
  -- never the ballot rankings themselves.
  elsif new.command like 'jury.ballot.review.%' then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_ballot_id := nullif(new.result ->> 'ballotId', '')::uuid;
      v_aggregate_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Jury ballot review has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null
       or v_show_id is null
       or v_ballot_id is null
       or v_aggregate_version is null then
      raise exception 'Completed Jury ballot review lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.jury_ballot_submissions ballot
      where ballot.id = v_ballot_id
        and ballot.edition_id = v_edition_id
        and ballot.show_id = v_show_id
        and ballot.review_version = v_aggregate_version
    ) then
      raise exception 'Completed Jury ballot review does not match canonical ballot state'
        using errcode = '23514';
    end if;

    v_event_type := 'jury.ballot_changed';
    v_aggregate_type := 'jury_ballot';
    v_aggregate_id := v_ballot_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'ballotId', v_ballot_id,
      'showId', v_show_id,
      'fromStatus', new.scope ->> 'fromStatus',
      'status', new.result ->> 'status',
      'version', new.result -> 'version'
    ));

  -- Did-not-vote is deliberately separate absence evidence, but it changes the
  -- same Jury responsibility/readiness projection. A semantic aggregate id
  -- avoids pretending there is a ballot row when there is not one.
  elsif new.command in ('jury.dnv.set', 'jury.dnv.clear') then
    begin
      v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
      v_show_id := nullif(new.scope ->> 'showId', '')::uuid;
      v_voter_id := nullif(new.scope ->> 'voterId', '')::uuid;
      v_voter_country_id := nullif(new.scope ->> 'voterCountryId', '')::uuid;
      v_voter_entity_id := nullif(new.scope ->> 'voterEntityId', '')::uuid;
      v_aggregate_version := coalesce(nullif(new.scope ->> 'expectedVersion', '')::bigint, 0) + 1;
    exception when invalid_text_representation then
      raise exception 'Completed Jury DNV operation has invalid event provenance'
        using errcode = '23514';
    end;

    if v_edition_id is null
       or v_show_id is null
       or (v_voter_id is null and v_voter_country_id is null and v_voter_entity_id is null) then
      raise exception 'Completed Jury DNV operation lacks event provenance'
        using errcode = '23514';
    end if;

    if not exists (
      select 1
      from public.shows show_row
      where show_row.id = v_show_id
        and show_row.edition_id = v_edition_id
    ) then
      raise exception 'Completed Jury DNV operation is outside canonical show scope'
        using errcode = '23514';
    end if;

    v_event_type := 'jury.ballot_changed';
    v_aggregate_type := 'jury_requirement';
    v_aggregate_id := v_show_id::text || ':' || case
      when v_voter_id is not null then 'voter:' || v_voter_id::text
      when v_voter_entity_id is not null then 'entity:' || v_voter_entity_id::text
      else 'country:' || v_voter_country_id::text
    end;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'showId', v_show_id,
      'voterId', v_voter_id,
      'voterCountryId', v_voter_country_id,
      'voterEntityId', v_voter_entity_id,
      'dnv', new.result -> 'dnv',
      'changeKind', case
        when new.command = 'jury.dnv.set' then 'dnv_set'
        else 'dnv_cleared'
      end
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
    v_show_id,
    v_payload,
    1,
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_jury_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_jury_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_jury_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_jury_operation_event();

-- Consume one claimed Jury consequence in the same transaction as its concrete
-- reconciliation work. Consumer receipts make replay a no-op and S4 leases keep
-- concurrent workers from applying the same delivery twice.
create or replace function public.studio2_process_jury_domain_event(
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
     or p_consumer_key not in ('jury.tasks', 'jury.notifications')
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Jury domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('jury.opened', 'jury.closed', 'jury.ballot_changed') then
    raise exception 'Jury consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  if p_consumer_key = 'jury.notifications' and v_event.event_type <> 'jury.opened' then
    raise exception 'Jury notification consumer only accepts jury.opened'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Jury domain event delivery was not found'
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
    raise exception 'Jury domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  if p_consumer_key = 'jury.tasks' then
    perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
    v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
    v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);
    v_metadata := jsonb_build_object(
      'effect', 'jury-task-reconciliation',
      'editionId', v_event.edition_id,
      'showId', v_event.show_id,
      'taskNotificationsChanged', v_task_notifications,
      'staleTaskNotificationsPruned', v_pruned_notifications
    );
  else
    v_delivery_candidates := public.solaris_enqueue_app_notifications(now());
    v_metadata := jsonb_build_object(
      'effect', 'jury-open-notification-evaluation',
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

revoke all on function public.studio2_process_jury_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_jury_domain_event(uuid, text, text)
  to service_role;

commit;
