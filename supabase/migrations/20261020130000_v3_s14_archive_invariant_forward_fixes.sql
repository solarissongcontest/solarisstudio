begin;

-- System V3 / S14 forward fix.
--
-- Archive is irreversible even for database owners and service-role workers.
-- Keep the historical task resolution timestamp stable and make the Archive
-- consequence reconcile the existing canonical task-delivery projection after
-- every consumer invocation.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.archive-invariant-forward-fixes',
  1,
  'forward_fix_only',
  false,
  null,
  'Preserve irreversible Archive runtime state, historical Task resolution evidence, and canonical resolved-Task delivery reconciliation.'
)
on conflict (migration_key) do nothing;

create or replace function private.v3_guard_archive_runtime_transition()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $guard$
begin
  if tg_op = 'DELETE' then
    if old.state = 'archived' then
      raise exception 'Archived edition runtime is irreversible.'
        using errcode = '42501';
    end if;
    return old;
  end if;

  if old.state = 'archived'
     and new.state is distinct from old.state then
    raise exception 'Archived edition runtime is irreversible.'
      using errcode = '42501';
  end if;

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

drop trigger if exists v3_guard_archive_runtime_delete
  on public.studio2_edition_runtime;
create trigger v3_guard_archive_runtime_delete
before delete on public.studio2_edition_runtime
for each row execute function private.v3_guard_archive_runtime_transition();

create or replace function private.v3_guard_archived_edition_task_resurrection()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if new.edition_id is null
     or new.state = 'resolved'
     or not private.v3_archive_task_type_is_current_workflow(new.task_type) then
    return new;
  end if;

  if exists (
    select 1
    from public.studio2_edition_runtime runtime
    where runtime.edition_id = new.edition_id
      and runtime.state = 'archived'
  ) then
    new.state := 'resolved';
    if tg_op = 'UPDATE' then
      new.resolved_at := coalesce(old.resolved_at, new.resolved_at, now());
    else
      new.resolved_at := coalesce(new.resolved_at, now());
    end if;
    new.last_evaluated_at := now();
    new.updated_at := now();
  end if;

  return new;
end
$guard$;

revoke all on function private.v3_guard_archived_edition_task_resurrection()
  from public, anon, authenticated;

-- Keep the existing reconciler as the one source of derived Inbox/delivery
-- state. The final canonical prune call covers queue rows that predate the
-- Task trigger or have been restored with legacy event shapes.
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
  v_count integer := 0;
begin
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

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  update public.notification_deliveries delivery
  set status = 'suppressed',
      processing_started_at = null,
      error = 'Organizer Task resolved before delivery.'
  from public.studio2_organizer_tasks task
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = task.id::text
    and delivery.status in ('pending', 'processing', 'failed')
    and task.state = 'resolved'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;
  v_changed := v_changed + private.studio2_prune_stale_task_notifications(p_edition_id);

  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.v3_reconcile_resolved_task_notifications(uuid) is
  'Reconcile resolved Organizer Tasks into retained non-actionable Inbox evidence and suppress every canonical undelivered task delivery.';

commit;
