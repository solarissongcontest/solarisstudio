begin;

-- Organisation OS V5 R3 permission approvals become canonical Organizer Tasks.
-- The approval task is assigned only to eligible operators other than the
-- requester. Once independently approved, a separate apply task is assigned
-- only to the original requester.

create or replace function private.studio2_reconcile_permission_approval_tasks()
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $reconcile$
begin
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'permission_approval'
    and not exists (
      select 1
      from public.studio2_permission_change_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is null
        and request.approval_expires_at > now()
        and request.requested_by is not null
        and task.assigned_to is not null
        and task.assigned_to <> request.requested_by
        and private.studio2_user_has_capability(
          task.assigned_to,
          'permissions.manage',
          null
        )
    );

  insert into public.studio2_organizer_tasks (
    assigned_to,
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
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    candidate.id,
    'permission_approval',
    request.id::text,
    'permission-approval:' || request.id::text || ':approve:' || candidate.id::text,
    'permissions.r3.approve',
    'permissions.manage',
    'critical',
    'open',
    'Approve R3 permission change',
    'Review the exact ' ||
      replace(request.change_kind, '_', ' ') ||
      ' operation for ' ||
      request.permission_key ||
      '. The requester cannot approve their own operation.',
    '/admin/access-permissions',
    request.approval_expires_at,
    jsonb_build_object(
      'table', 'studio2_permission_change_approval_requests',
      'id', request.id,
      'phase', 'approve',
      'resolvedWhen', jsonb_build_array('approved', 'consumed', 'expired')
    ),
    request.requested_at,
    null,
    now(),
    now()
  from public.studio2_permission_change_approval_requests request
  join auth.users candidate
    on candidate.id <> request.requested_by
   and private.studio2_user_has_capability(
     candidate.id,
     'permissions.manage',
     null
   )
  where request.consumed_at is null
    and request.approved_at is null
    and request.approval_expires_at > now()
    and request.requested_by is not null
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'permission_approval_apply'
    and not exists (
      select 1
      from public.studio2_permission_change_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is not null
        and request.approved_by is not null
        and request.requested_by is not null
        and request.approval_expires_at > now()
        and task.assigned_to = request.requested_by
        and private.studio2_user_has_capability(
          request.requested_by,
          'permissions.manage',
          null
        )
    );

  insert into public.studio2_organizer_tasks (
    assigned_to,
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
    due_at,
    resolution_predicate,
    opened_at,
    resolved_at,
    last_evaluated_at,
    updated_at
  )
  select
    request.requested_by,
    'permission_approval_apply',
    request.id::text,
    'permission-approval:' || request.id::text || ':apply',
    'permissions.r3.apply',
    'permissions.manage',
    'critical',
    'open',
    'Apply approved R3 permission change',
    'A different authorized organizer approved the bound ' ||
      replace(request.change_kind, '_', ' ') ||
      ' operation for ' ||
      request.permission_key ||
      '. Reauthenticate and apply it before the approval expires.',
    '/admin/access-permissions',
    request.approval_expires_at,
    jsonb_build_object(
      'table', 'studio2_permission_change_approval_requests',
      'id', request.id,
      'phase', 'apply',
      'resolvedWhen', jsonb_build_array('consumed', 'expired')
    ),
    coalesce(request.approved_at, request.requested_at),
    null,
    now(),
    now()
  from public.studio2_permission_change_approval_requests request
  where request.consumed_at is null
    and request.approved_at is not null
    and request.approved_by is not null
    and request.requested_by is not null
    and request.approval_expires_at > now()
    and private.studio2_user_has_capability(
      request.requested_by,
      'permissions.manage',
      null
    )
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();
end
$reconcile$;

revoke all on function private.studio2_reconcile_permission_approval_tasks()
  from public, anon, authenticated;

create or replace function private.studio2_permission_approval_task_trigger()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
as $trigger$
begin
  perform private.studio2_reconcile_permission_approval_tasks();
  return null;
end
$trigger$;

revoke all on function private.studio2_permission_approval_task_trigger()
  from public, anon, authenticated;

drop trigger if exists studio2_permission_approval_task_reconcile
  on public.studio2_permission_change_approval_requests;
create trigger studio2_permission_approval_task_reconcile
after insert or update on public.studio2_permission_change_approval_requests
for each statement
execute function private.studio2_permission_approval_task_trigger();

create or replace function private.studio2_reconcile_all_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private, televoting, auth
as $alltasks$
begin
  perform private.studio2_reconcile_organizer_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_operational(p_edition_id);
  perform private.studio2_reconcile_confirmation_requirement_tasks(p_edition_id);
  perform private.studio2_reconcile_organizer_tasks_truth(p_edition_id);
  perform private.studio2_reconcile_permission_approval_tasks();
  perform private.studio2_sync_task_notifications(p_edition_id);
  perform private.studio2_prune_stale_task_notifications(p_edition_id);
end
$alltasks$;

revoke all on function private.studio2_reconcile_all_organizer_tasks(uuid)
  from public, anon, authenticated;

create or replace function public.admin_organizer_tasks(
  p_edition_id uuid default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $tasks$
declare
  v_actor uuid := auth.uid();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_filter not in ('all', 'mine', 'waiting', 'resolved') then
    raise exception 'Unknown task filter: %', v_filter using errcode = '22023';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  if p_edition_id is null
     and not public.studio2_access_allowed('edition.read', null, false)
     and not public.studio2_access_allowed('integrity.read', null, false)
     and not public.studio2_access_allowed('incident.read', null, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'id', task.id,
        'editionId', task.edition_id,
        'countryId', task.country_id,
        'assignedTo', task.assigned_to,
        'sourceKind', task.source_kind,
        'sourceKey', task.source_key,
        'taskType', task.task_type,
        'priority', task.priority,
        'state', task.state,
        'title', task.title,
        'description', task.description,
        'href', task.href,
        'dueAt', task.due_at,
        'resolutionPredicate', task.resolution_predicate,
        'ruleReference', task.rule_reference,
        'openedAt', task.opened_at,
        'resolvedAt', task.resolved_at,
        'lastEvaluatedAt', task.last_evaluated_at
      )
      order by
        case task.priority when 'critical' then 1 when 'high' then 2 else 3 end,
        task.due_at asc nulls last,
        task.opened_at desc
    )
    from public.studio2_organizer_tasks task
    where (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
      and public.studio2_access_allowed(task.required_capability, task.edition_id, false)
      and (
        task.source_kind not in ('permission_approval', 'permission_approval_apply')
        or task.assigned_to = v_actor
      )
      and (
        (v_filter = 'all' and task.state <> 'resolved')
        or (v_filter = 'mine' and task.state <> 'resolved' and task.assigned_to = v_actor)
        or (v_filter = 'waiting' and task.state = 'waiting')
        or (v_filter = 'resolved' and task.state = 'resolved')
      )
  ), '[]'::jsonb);
end
$tasks$;

revoke all on function public.admin_organizer_tasks(uuid, text)
  from public, anon;
grant execute on function public.admin_organizer_tasks(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_organizer_task_count(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $count$
declare
  v_actor uuid := auth.uid();
  v_count integer := 0;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  select count(*)::integer
  into v_count
  from public.studio2_organizer_tasks task
  where task.state <> 'resolved'
    and (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
    and public.studio2_access_allowed(task.required_capability, task.edition_id, false)
    and (
      task.source_kind not in ('permission_approval', 'permission_approval_apply')
      or task.assigned_to = v_actor
    );

  return v_count;
end
$count$;

revoke all on function public.admin_organizer_task_count(uuid)
  from public, anon;
grant execute on function public.admin_organizer_task_count(uuid)
  to authenticated, service_role;

-- Materialize any approval work that existed before this migration was applied.
select private.studio2_reconcile_permission_approval_tasks();

notify pgrst, 'reload schema';

commit;
