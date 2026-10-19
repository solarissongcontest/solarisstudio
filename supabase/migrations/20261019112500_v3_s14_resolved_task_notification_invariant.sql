begin;

-- System V3 / S14 forward fix.
--
-- Organizer Task state is canonical workflow truth. A resolved Task must never
-- project as an actionable Inbox item or remain deliverable merely because one
-- caller forgot to run the aggregate notification reconciler afterward.
--
-- This is intentionally general rather than Archive-specific: Archive is the
-- scenario that exposed the gap, but the invariant belongs to every domain-
-- backed Organizer Task.
insert into private.v3_migration_contracts (
  migration_key,
  schema_version,
  rollback_mode,
  destructive,
  backfill_key,
  reason
) values (
  'v3.s14.resolved-task-notification-invariant',
  1,
  'forward_fix_only',
  false,
  null,
  'Make Organizer Task resolution authoritative for Inbox action state and pending delivery suppression, independent of reconciliation call ordering.'
)
on conflict (migration_key) do nothing;

-- Keep the existing fan-out and push semantics, but derive current-action state
-- from the Task itself. The old implementation copied resolved_at correctly yet
-- unconditionally set requires_action=true in the same update.
create or replace function private.studio2_sync_task_notifications(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $sync$
declare
  v_changed integer := 0;
  v_count integer := 0;
begin
  -- Domain Task state is authoritative for every Task-backed Inbox item.
  update public.admin_notifications notification
  set
    resolved_at = task.resolved_at,
    requires_action = task.state <> 'resolved',
    resolution_mode = 'domain'
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and (
      notification.resolved_at is distinct from task.resolved_at
      or notification.requires_action is distinct from (task.state <> 'resolved')
    );

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- Assigned Tasks notify only the assigned capable operator. Unassigned Tasks,
  -- or assignments that lost permission, fan out to operators who actually
  -- hold the Task's required capability in the same scope.
  with active_tasks as (
    select task.*
    from public.studio2_organizer_tasks task
    where task.state <> 'resolved'
      and (
        p_edition_id is null
        or task.edition_id is null
        or task.edition_id = p_edition_id
      )
  ),
  recipients as (
    select
      task.id as task_id,
      task.assigned_to as user_id
    from active_tasks task
    where task.assigned_to is not null
      and private.studio2_user_has_capability(
        task.assigned_to,
        task.required_capability,
        task.edition_id
      )

    union

    select
      task.id,
      direct_grant.user_id
    from active_tasks task
    join public.studio2_capability_grants direct_grant
      on direct_grant.capability = task.required_capability
     and (direct_grant.expires_at is null or direct_grant.expires_at > now())
     and (
       direct_grant.edition_id is null
       or (
         task.edition_id is not null
         and direct_grant.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      assignment.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.studio2_role_assignments assignment
      on assignment.role_key = role_capability.role_key
     and (assignment.expires_at is null or assignment.expires_at > now())
     and (
       assignment.edition_id is null
       or (
         task.edition_id is not null
         and assignment.edition_id = task.edition_id
       )
     )
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )

    union

    select
      task.id,
      legacy_role.user_id
    from active_tasks task
    join public.studio2_role_capabilities role_capability
      on role_capability.capability = task.required_capability
    join public.user_roles legacy_role
      on legacy_role.role::text = role_capability.role_key
    where task.assigned_to is null
       or not private.studio2_user_has_capability(
         task.assigned_to,
         task.required_capability,
         task.edition_id
       )
  )
  insert into public.admin_notifications (
    recipient_id,
    severity,
    title,
    body,
    href,
    source_key,
    read_at,
    resolved_at,
    requires_action,
    resolution_mode
  )
  select distinct
    recipient.user_id,
    case
      when task.priority = 'critical' then 'critical'
      when task.priority = 'high' then 'action'
      else 'warning'
    end,
    task.title,
    task.description,
    task.href,
    task.source_key,
    null::timestamptz,
    null::timestamptz,
    true,
    'domain'
  from recipients recipient
  join active_tasks task on task.id = recipient.task_id
  where recipient.user_id is not null
  on conflict (recipient_id, source_key)
    where source_key is not null
  do update set
    severity = excluded.severity,
    title = excluded.title,
    body = excluded.body,
    href = excluded.href,
    requires_action = true,
    resolution_mode = 'domain',
    resolved_at = null,
    read_at = case
      when public.admin_notifications.resolved_at is not null
        then null
      else public.admin_notifications.read_at
    end;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  -- High and critical Task activations join the existing push queue. This is a
  -- required Organizer delivery class: global push enable/disable and quiet
  -- hours still apply, but it is not disguised as a participant category.
  insert into public.notification_deliveries (
    user_id,
    category,
    event_type,
    subject_id,
    dedupe_key,
    route,
    title,
    body,
    scheduled_for
  )
  select
    notification.recipient_id,
    'organizer_tasks',
    case
      when task.priority = 'critical'
        then 'organizer_task.critical'
      else 'organizer_task.high'
    end,
    task.id::text,
    'organizer-task:' || task.source_key || ':' || notification.recipient_id::text,
    task.href,
    task.title,
    left(task.description, 240),
    now()
  from public.admin_notifications notification
  join public.studio2_organizer_tasks task
    on task.source_key = notification.source_key
  where notification.resolution_mode = 'domain'
    and notification.requires_action = true
    and notification.resolved_at is null
    and task.state <> 'resolved'
    and task.priority in ('critical', 'high')
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
  on conflict (user_id, dedupe_key) do nothing;

  get diagnostics v_count = row_count;
  v_changed := v_changed + v_count;

  return v_changed;
end
$sync$;

revoke all on function private.studio2_sync_task_notifications(uuid)
  from public, anon, authenticated;

-- Immediate fail-safe for code paths that resolve a Task but do not invoke the
-- aggregate reconciler in the same transaction. Historical notification rows
-- remain; only their present-tense action claim and undelivered push attempts
-- are ended.
create or replace function private.v3_project_resolved_task_delivery_state()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $project$
begin
  if new.state <> 'resolved' then
    return new;
  end if;

  update public.admin_notifications notification
  set
    resolved_at = coalesce(new.resolved_at, notification.resolved_at, now()),
    requires_action = false,
    resolution_mode = 'domain'
  where notification.source_key = new.source_key
    and notification.resolution_mode = 'domain'
    and (
      notification.resolved_at is distinct from coalesce(new.resolved_at, notification.resolved_at, now())
      or notification.requires_action
    );

  update public.notification_deliveries delivery
  set
    status = 'suppressed',
    processing_started_at = null,
    error = 'Organizer Task resolved before delivery.'
  where delivery.category = 'organizer_tasks'
    and delivery.subject_id = new.id::text
    and delivery.status in ('pending', 'processing', 'failed');

  return new;
end
$project$;

revoke all on function private.v3_project_resolved_task_delivery_state()
  from public, anon, authenticated;

drop trigger if exists v3_project_resolved_task_delivery_state
  on public.studio2_organizer_tasks;
create trigger v3_project_resolved_task_delivery_state
after insert or update of state, resolved_at on public.studio2_organizer_tasks
for each row execute function private.v3_project_resolved_task_delivery_state();

comment on function private.v3_project_resolved_task_delivery_state() is
  'Project canonical Organizer Task resolution immediately into historical Inbox action state and suppress undelivered task pushes.';

commit;
