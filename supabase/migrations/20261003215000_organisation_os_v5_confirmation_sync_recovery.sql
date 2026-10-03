begin;

-- Organisation OS V5 confirmation-sync recovery.
--
-- Confirmations already records every Solaris projection attempt in
-- integration_events. The latest event for one remote confirmation submission
-- is therefore the canonical recovery truth: failed => actionable Task;
-- completed => automatically resolved.

create or replace function private.studio2_reconcile_confirmation_sync_tasks()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $reconcile$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  with latest as (
    select distinct on (event.remote_id)
      event.id,
      event.remote_id,
      event.status,
      event.last_error,
      event.updated_at,
      edition.id as edition_id
    from public.integration_events event
    left join public.editions edition
      on edition.edition_number = case
        when coalesce(event.payload -> 'edition' ->> 'edition_number', '') ~ '^[0-9]+$'
          then (event.payload -> 'edition' ->> 'edition_number')::integer
        else null
      end
    where event.service = 'confirmations'
      and event.event_type = 'confirmation.snapshot.synced'
      and event.remote_id is not null
    order by event.remote_id, event.updated_at desc, event.id desc
  )
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'confirmation_sync'
    and not exists (
      select 1
      from latest
      where latest.remote_id = task.source_id
        and latest.status = 'failed'
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  with latest as (
    select distinct on (event.remote_id)
      event.id,
      event.remote_id,
      event.status,
      event.last_error,
      event.updated_at,
      edition.id as edition_id
    from public.integration_events event
    left join public.editions edition
      on edition.edition_number = case
        when coalesce(event.payload -> 'edition' ->> 'edition_number', '') ~ '^[0-9]+$'
          then (event.payload -> 'edition' ->> 'edition_number')::integer
        else null
      end
    where event.service = 'confirmations'
      and event.event_type = 'confirmation.snapshot.synced'
      and event.remote_id is not null
    order by event.remote_id, event.updated_at desc, event.id desc
  )
  insert into public.studio2_organizer_tasks (
    edition_id,
    source_kind,
    source_id,
    source_key,
    task_type,
    required_capability,
    priority,
    state,
    title,
    description,
    href,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    latest.edition_id,
    'confirmation_sync',
    latest.remote_id,
    'confirmation-sync:' || latest.remote_id,
    'confirmation.sync.recover',
    'confirmation.manage',
    'high',
    'open',
    'Confirmation sync needs recovery',
    coalesce(
      nullif(btrim(latest.last_error), ''),
      'The latest Confirmations → Solaris projection failed.'
    )
      || ' Open Sync, correct the underlying mismatch or service failure, then retry. '
      || 'This task resolves only after a later successful sync for the same submission.',
    '/confirmations/admin/sync',
    jsonb_build_object(
      'table', 'integration_events',
      'service', 'confirmations',
      'eventType', 'confirmation.snapshot.synced',
      'remoteId', latest.remote_id,
      'resolvedWhen', 'latest status = completed'
    ),
    latest.updated_at,
    null,
    now(),
    now()
  from latest
  where latest.status = 'failed'
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    opened_at = least(
      public.studio2_organizer_tasks.opened_at,
      excluded.opened_at
    ),
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$reconcile$;

revoke all on function private.studio2_reconcile_confirmation_sync_tasks()
  from public, anon, authenticated;

create or replace function private.studio2_confirmation_sync_task_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $trigger$
begin
  perform private.studio2_reconcile_confirmation_sync_tasks();
  perform private.studio2_sync_task_notifications(null);
  perform private.studio2_prune_stale_task_notifications(null);
  return null;
end
$trigger$;

revoke all on function private.studio2_confirmation_sync_task_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_confirmation_sync_task_reconcile
  on public.integration_events;
create trigger studio2_confirmation_sync_task_reconcile
after insert or update of status, last_error, updated_at
on public.integration_events
for each statement
execute function private.studio2_confirmation_sync_task_trigger();

-- Backfill any unresolved failures that predate this migration.
select private.studio2_reconcile_confirmation_sync_tasks();
select private.studio2_sync_task_notifications(null);
select private.studio2_prune_stale_task_notifications(null);

notify pgrst, 'reload schema';

commit;
