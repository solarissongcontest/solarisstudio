begin;

-- System V3 S5: Entry review consequences become transactional DomainEvents.
--
-- The S2 Entry review command already owns authorization, semantic
-- idempotency, exact revision binding, mutation, audit history and its durable
-- operation receipt. This migration attaches completed facts and the existing
-- Organizer task/notification projection to that common success boundary. It
-- does not add a second Entry write model or backfill historical operations.

create or replace function private.v3_emit_entry_operation_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_edition_id uuid;
  v_entry_version_id uuid;
  v_version bigint;
  v_target_type text;
  v_event_type text;
  v_status text;
begin
  if old.status = 'succeeded'
     or new.status <> 'succeeded'
     or new.command not in (
       'entry.request_changes',
       'entry.accept',
       'entry.remove',
       'entry.reset_review'
     ) then
    return new;
  end if;

  begin
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_entry_id := nullif(new.result ->> 'entryId', '')::uuid;
    v_entry_version_id := nullif(new.result ->> 'entryVersionId', '')::uuid;
    v_version := nullif(new.result ->> 'version', '')::bigint;
    v_edition_id := nullif(new.scope ->> 'editionId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed Entry operation has invalid event provenance'
      using errcode = '23514';
  end;

  v_target_type := nullif(btrim(new.result ->> 'targetType'), '');
  v_status := nullif(btrim(new.result ->> 'status'), '');

  if v_submission_id is null
     or v_entry_id is null
     or v_entry_version_id is null
     or v_version is null
     or v_edition_id is null
     or v_target_type not in ('internal', 'national_final')
     or v_status not in ('pending', 'accepted', 'declined', 'removed') then
    raise exception 'Completed Entry operation lacks event provenance'
      using errcode = '23514';
  end if;

  if not exists (
    select 1
    from public.submissions submission
    where submission.id = v_submission_id
      and submission.edition_id = v_edition_id
  ) then
    raise exception 'Completed Entry operation is outside its canonical edition scope'
      using errcode = '23514';
  end if;

  if (
    v_target_type = 'internal'
    and not exists (
      select 1
      from public.internal_entries entry
      where entry.id = v_entry_id
        and entry.submission_id = v_submission_id
        and entry.current_version_id = v_entry_version_id
    )
  ) or (
    v_target_type = 'national_final'
    and not exists (
      select 1
      from public.national_final_entries entry
      join public.national_finals final on final.id = entry.national_final_id
      where entry.id = v_entry_id
        and final.submission_id = v_submission_id
        and entry.current_version_id = v_entry_version_id
    )
  ) then
    raise exception 'Completed Entry operation does not match its canonical Entry revision'
      using errcode = '23514';
  end if;

  v_event_type := case
    when new.command = 'entry.request_changes' then 'entry.changes_requested'
    else 'entry.reviewed'
  end;

  perform private.v3_emit_domain_event(
    v_event_type,
    'entry_review',
    v_entry_id::text,
    v_version,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_build_object(
      'submissionId', v_submission_id,
      'entryId', v_entry_id,
      'entryVersionId', v_entry_version_id,
      'targetType', v_target_type,
      'status', v_status,
      'reviewState', new.result ->> 'reviewState'
    ),
    1,
    array['entry.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_entry_operation_event()
  from public, anon, authenticated;

drop trigger if exists v3_emit_entry_operation_event
  on public.studio2_operation_receipts;
create trigger v3_emit_entry_operation_event
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_entry_operation_event();

create or replace function public.studio2_process_entry_domain_event(
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
     or p_consumer_key <> 'entry.tasks'
     or nullif(btrim(coalesce(p_worker_id, '')), '') is null
     or length(p_worker_id) > 160 then
    raise exception 'Invalid Entry domain event consumer parameters'
      using errcode = '22023';
  end if;

  select event_row.*
  into v_event
  from private.v3_domain_events event_row
  where event_row.id = p_event_id;

  if v_event.id is null
     or v_event.event_type not in ('entry.reviewed', 'entry.changes_requested') then
    raise exception 'Entry consumer received an unsupported domain event'
      using errcode = '22023';
  end if;

  select delivery.*
  into v_delivery
  from private.v3_domain_event_outbox delivery
  where delivery.event_id = p_event_id
    and delivery.consumer_key = p_consumer_key
  for update;

  if v_delivery.event_id is null then
    raise exception 'Entry domain event delivery was not found'
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
    raise exception 'Entry domain event delivery lease is no longer owned by this worker'
      using errcode = '40001';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(v_event.edition_id);
  v_metadata := jsonb_build_object(
    'effect', 'entry-task-reconciliation',
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

revoke all on function public.studio2_process_entry_domain_event(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.studio2_process_entry_domain_event(uuid, text, text)
  to service_role;

commit;
