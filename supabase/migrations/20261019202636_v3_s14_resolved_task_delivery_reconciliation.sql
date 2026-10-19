begin;

-- System V3 / S14 forward fix.
--
-- The immediate Task-resolution trigger added by the S14 notification
-- invariant protects new state transitions. Reconciliation must also repair
-- delivery rows that pre-date that trigger, or that were restored/poisoned
-- after the transition. Keep the historical rows and end only their current
-- claim to be deliverable.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.resolved-task-delivery-reconciliation',
  1,
  'forward_fix_only',
  false,
  null,
  'Make the canonical resolved-Task reconciler converge undelivered Organizer Task delivery rows as well as Inbox action state.'
)
on conflict (migration_key) do nothing;

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
  -- Historical Inbox evidence remains. Only its current-action claim is ended.
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

  -- Reconcile historical and uncertain delivery attempts too. Delivered rows
  -- are immutable evidence and are deliberately excluded.
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

  return v_changed;
end
$reconcile$;

revoke all on function private.v3_reconcile_resolved_task_notifications(uuid)
  from public, anon, authenticated;

comment on function private.v3_reconcile_resolved_task_notifications(uuid) is
  'Reconcile resolved Organizer Tasks into retained non-actionable Inbox evidence and suppressed undelivered task deliveries.';

commit;
