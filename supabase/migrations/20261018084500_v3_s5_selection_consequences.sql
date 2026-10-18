begin;

-- System V3 S5 National Selection consequences.
--
-- Selection review and winner mutations already complete through the shared S2
-- operation receipt. Attach Selection-domain facts to those same success
-- boundaries instead of creating another review/winner write model.
--
-- A National Final candidate review is also an Entry review. One operation can
-- therefore emit both Entry and Selection facts without duplicating the command.

create or replace function private.v3_emit_selection_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_entry_version_id uuid;
  v_national_final_id uuid;
  v_winner_entry_id uuid;
  v_edition_id uuid;
  v_version bigint;
  v_target_type text;
  v_status text;
  v_action text;
  v_event_type text;
  v_aggregate_type text;
  v_aggregate_id text;
  v_payload jsonb;
  v_consumers text[] := array[]::text[];
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  if new.command in (
    'entry.request_changes',
    'entry.accept',
    'entry.remove',
    'entry.reset_review'
  ) then
    v_target_type := nullif(btrim(new.result ->> 'targetType'), '');
    if v_target_type <> 'national_final' then
      return new;
    end if;

    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_entry_id := nullif(new.result ->> 'entryId', '')::uuid;
      v_entry_version_id := nullif(new.result ->> 'entryVersionId', '')::uuid;
      v_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Selection review operation has invalid provenance'
        using errcode = '23514';
    end;

    v_status := nullif(btrim(new.result ->> 'status'), '');
    if v_submission_id is null
       or v_entry_id is null
       or v_entry_version_id is null
       or v_version is null
       or v_version < 1
       or v_status not in ('pending', 'accepted', 'declined', 'removed') then
      raise exception 'Completed Selection review operation lacks event provenance'
        using errcode = '23514';
    end if;

    select
      final.id,
      submission.edition_id
    into
      v_national_final_id,
      v_edition_id
    from public.national_final_entries entry
    join public.national_finals final
      on final.id = entry.national_final_id
    join public.submissions submission
      on submission.id = final.submission_id
    where entry.id = v_entry_id
      and entry.current_version_id = v_entry_version_id
      and submission.id = v_submission_id;

    if v_national_final_id is null or v_edition_id is null then
      raise exception 'Completed Selection review does not match its canonical National Final revision'
        using errcode = '23514';
    end if;

    v_event_type := 'selection.reviewed';
    v_aggregate_type := 'selection_review';
    v_aggregate_id := v_entry_id::text;
    v_payload := jsonb_build_object(
      'submissionId', v_submission_id,
      'nationalFinalId', v_national_final_id,
      'entryId', v_entry_id,
      'entryVersionId', v_entry_version_id,
      'status', v_status,
      'reviewState', new.result ->> 'reviewState'
    );
    v_consumers := array['selection.tasks']::text[];

  elsif new.command in (
    'confirmation.nf_winner.select',
    'confirmation.nf_winner.clear'
  ) then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_national_final_id := nullif(new.result ->> 'nationalFinalId', '')::uuid;
      v_winner_entry_id := nullif(new.result ->> 'winnerEntryId', '')::uuid;
      v_version := nullif(new.result ->> 'version', '')::bigint;
    exception when invalid_text_representation then
      raise exception 'Completed Selection winner operation has invalid provenance'
        using errcode = '23514';
    end;

    v_action := nullif(btrim(new.result ->> 'action'), '');
    if v_submission_id is null
       or v_national_final_id is null
       or v_version is null
       or v_version < 1
       or v_action not in ('select', 'clear')
       or (v_action = 'select' and v_winner_entry_id is null)
       or (v_action = 'clear' and v_winner_entry_id is not null) then
      raise exception 'Completed Selection winner operation lacks event provenance'
        using errcode = '23514';
    end if;

    select submission.edition_id
    into v_edition_id
    from public.national_finals final
    join public.submissions submission
      on submission.id = final.submission_id
    where final.id = v_national_final_id
      and final.submission_id = v_submission_id
      and final.winning_entry_id is not distinct from v_winner_entry_id;

    if v_edition_id is null then
      raise exception 'Completed Selection winner operation does not match canonical winner state'
        using errcode = '23514';
    end if;

    if v_action = 'select' and not exists (
      select 1
      from public.national_final_entries entry
      where entry.id = v_winner_entry_id
        and entry.national_final_id = v_national_final_id
        and entry.review_status = 'accepted'
        and not coalesce(entry.removed, false)
        and entry.current_version_id is not null
        and entry.reviewed_version_id = entry.current_version_id
    ) then
      raise exception 'Completed Selection winner operation is not bound to the exact accepted Entry revision'
        using errcode = '23514';
    end if;

    v_event_type := 'selection.winner_changed';
    v_aggregate_type := 'national_selection';
    v_aggregate_id := v_national_final_id::text;
    v_payload := jsonb_strip_nulls(jsonb_build_object(
      'submissionId', v_submission_id,
      'nationalFinalId', v_national_final_id,
      'action', v_action,
      'winnerEntryId', v_winner_entry_id
    ));
    -- Winner selection does not create a separate canonical winner-review task
    -- in the current Task Engine. Do not fabricate an outbox consumer.
    v_consumers := array[]::text[];
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
    v_consumers
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_selection_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_selection_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_selection_operation_event
after update of status
on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_selection_operation_event();

create or replace function public.studio2_process_selection_domain_event(
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
  v_metadata jsonb;
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if p_event_id is null
     or p_consumer_key <> 'selection.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Selection domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null or v_event.event_type <> 'selection.reviewed' then
    raise exception 'Selection consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Selection domain event delivery was not found'
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
    raise exception 'Selection domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  -- Current National Final pending-review truth is already part of the canonical
  -- aggregate task reconciler under confirmation_review. Reuse it instead of
  -- creating a second Selection-only task table or competing task type.
  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
  v_metadata := jsonb_build_object(
    'effect', 'selection-task-reconciliation',
    'editionId', v_event.edition_id
  );

  return public.studio2_complete_domain_event_delivery(
    p_event_id,
    p_consumer_key,
    p_worker_id,
    v_metadata
  );
end
$process$;

revoke all on function public.studio2_process_selection_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_selection_domain_event(uuid, text, text)
  to service_role;

commit;
