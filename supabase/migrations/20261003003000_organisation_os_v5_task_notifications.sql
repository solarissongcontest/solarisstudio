begin;

-- Organisation OS V5: canonical Tasks are truth; Organizer Inbox and Web Push
-- are delivery projections. Reading a notification never resolves its Task and
-- browser clients cannot manually resolve domain-backed notification rows.

alter table public.admin_notifications
  add column if not exists resolution_mode text not null default 'manual';

alter table public.admin_notifications
  drop constraint if exists admin_notifications_resolution_mode_check;

alter table public.admin_notifications
  add constraint admin_notifications_resolution_mode_check
  check (resolution_mode in ('manual', 'domain'));

create or replace function private.studio2_admin_notification_access(
  p_user_id uuid,
  p_source_key text
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $access$
  select
    p_user_id is not null
    and (
      coalesce(
        private.studio2_user_has_capability(
          p_user_id,
          'edition.manage',
          null
        ),
        false
      )
      or exists (
        select 1
        from public.studio2_organizer_tasks task
        where task.source_key = p_source_key
          and private.studio2_user_has_capability(
            p_user_id,
            task.required_capability,
            task.edition_id
          )
      )
    );
$access$;

revoke all on function private.studio2_admin_notification_access(uuid, text)
  from public, anon, authenticated;

drop policy if exists "Organizers read own notifications" on public.admin_notifications;
create policy "Organizers read own notifications"
on public.admin_notifications
for select
to authenticated
using (
  recipient_id = (select auth.uid())
  and private.studio2_admin_notification_access(
    (select auth.uid()),
    source_key
  )
);

drop policy if exists "Organizers update own notifications" on public.admin_notifications;
create policy "Organizers update own notifications"
on public.admin_notifications
for update
to authenticated
using (
  recipient_id = (select auth.uid())
  and private.studio2_admin_notification_access(
    (select auth.uid()),
    source_key
  )
)
with check (
  recipient_id = (select auth.uid())
  and private.studio2_admin_notification_access(
    (select auth.uid()),
    source_key
  )
);

create or replace function private.studio2_guard_domain_notification_resolution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $guard$
begin
  if old.resolution_mode = 'domain'
     and new.resolved_at is distinct from old.resolved_at
     and current_user in ('authenticated', 'anon') then
    raise exception
      'Task-backed notification resolution follows authoritative domain state.'
      using errcode = '42501';
  end if;

  return new;
end
$guard$;

revoke all on function private.studio2_guard_domain_notification_resolution()
  from public, anon, authenticated;

drop trigger if exists studio2_guard_domain_notification_resolution
  on public.admin_notifications;

create trigger studio2_guard_domain_notification_resolution
before update on public.admin_notifications
for each row execute function private.studio2_guard_domain_notification_resolution();

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
  -- Domain resolution is authoritative for every Task-backed Inbox item.
  update public.admin_notifications notification
  set
    resolved_at = task.resolved_at,
    requires_action = true,
    resolution_mode = 'domain'
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.resolution_mode = 'domain'
    and (
      p_edition_id is null
      or task.edition_id is null
      or task.edition_id = p_edition_id
    )
    and notification.resolved_at is distinct from task.resolved_at;

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
    null,
    null,
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

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_sync_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

-- The service-only push enqueue RPC runs on every dispatch cycle. Reconcile the
-- Organizer Task graph first so push delivery does not depend on an Organizer
-- opening Home, Tasks or Inbox in a browser.
create or replace function private.studio2_prepare_organizer_task_delivery()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $prepare$
begin
  perform private.studio2_reconcile_all_organizer_tasks(null);
end
$prepare$;

revoke all on function private.studio2_prepare_organizer_task_delivery()
  from public, anon, authenticated;

create or replace function public.solaris_prepare_organizer_task_delivery()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting
as $service$
begin
  if not private.studio2_request_is_service_role() then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  perform private.studio2_prepare_organizer_task_delivery();
end
$service$;

revoke all on function public.solaris_prepare_organizer_task_delivery()
  from public, anon, authenticated;
grant execute on function public.solaris_prepare_organizer_task_delivery()
  to service_role;

notify pgrst, 'reload schema';

commit;
