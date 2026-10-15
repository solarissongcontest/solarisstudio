begin;

-- System V3 S5: migrate the Entry facts that already have authoritative S2
-- operation provenance. entry.version_changed intentionally remains declared:
-- the Organizer historical-restore command is not yet on the S2 operation
-- contract, so marking every version change event-backed would overstate proof.

create or replace function private.v3_emit_entry_operation_events()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $emit$
declare
  v_submission_id uuid;
  v_entry_id uuid;
  v_entry_version_id uuid;
  v_entry_revision bigint;
  v_edition_id uuid;
  v_event_type text;
  v_version private.v3_entry_versions%rowtype;
begin
  if old.status = 'succeeded' or new.status <> 'succeeded' then
    return new;
  end if;

  -- Participant entry creation is part of the already-governed Confirmation
  -- submit transaction. Emit only exact revision-1 versions created by that same
  -- transaction; later revisions remain outside S5 until every writer is S2.
  if new.command = 'confirmation.submit' then
    begin
      v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
      v_edition_id := nullif(new.result ->> 'editionId', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Completed Confirmation submit has invalid Entry event provenance'
        using errcode = '23514';
    end;

    if v_submission_id is null or v_edition_id is null then
      return new;
    end if;

    for v_version in
      select version_row.*
      from private.v3_entry_versions version_row
      where version_row.submission_id = v_submission_id
        and version_row.edition_id = v_edition_id
        and version_row.revision = 1
        and version_row.source = 'canonical_write'
        and version_row.recorded_at = new.created_at
      order by version_row.entry_id
    loop
      perform private.v3_emit_domain_event(
        'entry.submitted',
        'entry',
        v_version.entry_id::text,
        v_version.revision,
        new.operation_id,
        v_version.edition_id,
        null,
        jsonb_build_object(
          'entryId', v_version.entry_id,
          'entryVersionId', v_version.id,
          'submissionId', v_version.submission_id,
          'targetType', v_version.target_type,
          'contentHash', v_version.content_hash
        ),
        1,
        array['entry.tasks']::text[]
      );
    end loop;

    return new;
  end if;

  if new.command not in (
    'entry.accept',
    'entry.remove',
    'entry.reset_review',
    'entry.request_changes'
  ) then
    return new;
  end if;

  begin
    v_submission_id := nullif(new.result ->> 'submissionId', '')::uuid;
    v_entry_id := nullif(new.result ->> 'entryId', '')::uuid;
    v_entry_version_id := nullif(new.result ->> 'entryVersionId', '')::uuid;
  exception when invalid_text_representation then
    raise exception 'Completed Entry review operation has invalid event provenance'
      using errcode = '23514';
  end;

  if v_submission_id is null or v_entry_id is null or v_entry_version_id is null then
    raise exception 'Completed Entry review operation lacks exact entry-version provenance'
      using errcode = '23514';
  end if;

  select version_row.revision, version_row.edition_id
  into v_entry_revision, v_edition_id
  from private.v3_entry_versions version_row
  where version_row.id = v_entry_version_id
    and version_row.entry_id = v_entry_id
    and version_row.submission_id = v_submission_id;

  if v_entry_revision is null or v_edition_id is null then
    raise exception 'Completed Entry review operation points at unknown immutable entry evidence'
      using errcode = '23503';
  end if;

  v_event_type := case
    when new.command = 'entry.request_changes' then 'entry.changes_requested'
    else 'entry.reviewed'
  end;

  perform private.v3_emit_domain_event(
    v_event_type,
    'entry',
    v_entry_id::text,
    v_entry_revision,
    new.operation_id,
    v_edition_id,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'entryId', v_entry_id,
      'entryVersionId', v_entry_version_id,
      'submissionId', v_submission_id,
      'targetType', new.result ->> 'targetType',
      'status', new.result ->> 'status',
      'reviewState', new.result ->> 'reviewState'
    )),
    1,
    array['entry.tasks']::text[]
  );

  return new;
end
$emit$;

revoke all on function private.v3_emit_entry_operation_events()
  from public, anon, authenticated;

drop trigger if exists v3_emit_entry_operation_events
  on public.studio2_operation_receipts;
create trigger v3_emit_entry_operation_events
after update of status on public.studio2_operation_receipts
for each row
when (old.status is distinct from new.status and new.status = 'succeeded')
execute function private.v3_emit_entry_operation_events();

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
  v_task_notifications integer := 0;
  v_pruned_notifications integer := 0;
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
     or v_event.event_type not in (
       'entry.submitted',
       'entry.reviewed',
       'entry.changes_requested'
     ) then
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

  perform private.studio2_reconcile_organizer_tasks_operational(v_event.edition_id);
  v_task_notifications := private.studio2_sync_task_notifications(v_event.edition_id);
  v_pruned_notifications := private.studio2_prune_stale_task_notifications(v_event.edition_id);

  v_metadata := jsonb_build_object(
    'effect', 'entry-task-reconciliation',
    'taskNotificationsChanged', v_task_notifications,
    'staleTaskNotificationsPruned', v_pruned_notifications
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
