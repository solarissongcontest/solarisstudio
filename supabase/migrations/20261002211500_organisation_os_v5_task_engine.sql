begin;

-- Organisation OS V5 canonical Organizer Task Engine.
--
-- Tasks are one domain-backed object per unresolved condition. Notifications
-- remain per-recipient delivery/history. Browser clients cannot mark a task
-- resolved: reconciliation derives state from the authoritative source tables.

create table if not exists public.studio2_organizer_tasks (
  id uuid primary key default gen_random_uuid(),
  edition_id uuid references public.editions(id) on delete cascade,
  country_id uuid references public.countries(id) on delete cascade,
  assigned_to uuid references auth.users(id) on delete set null,
  source_kind text not null check (length(btrim(source_kind)) between 1 and 80),
  source_id text not null check (length(btrim(source_id)) between 1 and 200),
  source_key text not null unique check (length(btrim(source_key)) between 1 and 280),
  task_type text not null check (length(btrim(task_type)) between 1 and 100),
  required_capability text not null references public.studio2_capabilities(key) on update cascade on delete restrict,
  priority text not null check (priority in ('critical', 'high', 'normal')),
  state text not null default 'open' check (state in ('open', 'waiting', 'resolved')),
  title text not null check (length(btrim(title)) between 1 and 220),
  description text not null default '',
  href text not null check (href like '/%'),
  due_at timestamptz,
  resolution_predicate jsonb not null default '{}'::jsonb
    check (jsonb_typeof(resolution_predicate) = 'object'),
  rule_reference text[] not null default '{}',
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_evaluated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint studio2_organizer_tasks_resolution_consistency check (
    (state = 'resolved' and resolved_at is not null)
    or (state <> 'resolved' and resolved_at is null)
  )
);

create index if not exists studio2_organizer_tasks_open_idx
  on public.studio2_organizer_tasks (edition_id, priority, due_at, opened_at desc)
  where state <> 'resolved';

create index if not exists studio2_organizer_tasks_assignee_idx
  on public.studio2_organizer_tasks (assigned_to, state, opened_at desc)
  where assigned_to is not null;

create index if not exists studio2_organizer_tasks_source_idx
  on public.studio2_organizer_tasks (source_kind, source_id);

alter table public.studio2_organizer_tasks enable row level security;
revoke all on table public.studio2_organizer_tasks from public, anon, authenticated;
grant all on table public.studio2_organizer_tasks to service_role;

create or replace function private.studio2_reconcile_organizer_tasks(
  p_edition_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  -- Incidents. Any non-resolved incident is actionable. The task resolves only
  -- when the incident domain itself reaches resolved.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'incident'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_incidents incident
      where incident.id::text = task.source_id
        and incident.status <> 'resolved'
    );

  insert into public.studio2_organizer_tasks (
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    incident.edition_id,
    'incident',
    incident.id::text,
    'studio2_incidents:' || incident.id::text,
    'incident.response',
    'incident.read',
    case incident.severity when 'sev1' then 'critical' when 'sev2' then 'high' else 'normal' end,
    'open',
    upper(incident.severity) || ' · ' || incident.title,
    'Resolve the incident in Incident Command. Task state follows the canonical incident lifecycle.',
    '/admin/incidents',
    jsonb_build_object(
      'table', 'studio2_incidents',
      'id', incident.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array('resolved')
    ),
    incident.started_at,
    null,
    now(),
    now()
  from public.studio2_incidents incident
  where incident.status <> 'resolved'
    and (p_edition_id is null or incident.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Critical lifecycle approvals. They are waiting work until approved/applied
  -- or expiry makes the request no longer actionable.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'transition_approval'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_transition_approval_requests request
      where request.id::text = task.source_id
        and request.consumed_at is null
        and request.approved_at is null
        and request.expires_at > now()
    );

  insert into public.studio2_organizer_tasks (
    edition_id, assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    request.edition_id,
    null,
    'transition_approval',
    request.id::text,
    'studio2_transition_approval_requests:' || request.id::text,
    'edition.transition.approval',
    'edition.manage',
    'critical',
    'waiting',
    'Approve critical edition transition',
    replace(request.from_state, '_', ' ') || ' → ' || replace(request.to_state, '_', ' ') || '. ' || request.reason,
    '/admin/control-room',
    request.expires_at,
    jsonb_build_object(
      'table', 'studio2_transition_approval_requests',
      'id', request.id,
      'resolvedWhen', jsonb_build_array('approved', 'consumed', 'expired')
    ),
    request.requested_at,
    null,
    now(),
    now()
  from public.studio2_transition_approval_requests request
  where request.consumed_at is null
    and request.approved_at is null
    and request.expires_at > now()
    and (p_edition_id is null or request.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'waiting',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Integrity cases. Keep details generic enough for the task list; capability
  -- filtering below determines whether the caller can even see that the task exists.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integrity_case'
    and not exists (
      select 1
      from public.integrity_cases integrity_case
      where integrity_case.id::text = task.source_id
        and integrity_case.status not like 'closed%'
    );

  insert into public.studio2_organizer_tasks (
    assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    integrity_case.assigned_to,
    'integrity_case',
    integrity_case.id::text,
    'integrity_cases:' || integrity_case.id::text,
    'integrity.case.review',
    'integrity.read',
    case integrity_case.priority when 'urgent' then 'critical' when 'high' then 'high' else 'normal' end,
    'open',
    'Integrity case needs review',
    'Case ' || integrity_case.public_code || ' remains in ' || replace(integrity_case.status, '_', ' ') || ' state.',
    '/admin/integrity-case/' || integrity_case.id::text,
    jsonb_build_object(
      'table', 'integrity_cases',
      'id', integrity_case.id,
      'field', 'status',
      'resolvedWhen', 'closed*'
    ),
    integrity_case.created_at,
    null,
    now(),
    now()
  from public.integrity_cases integrity_case
  where integrity_case.status not like 'closed%'
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Appeals remain actionable while submitted or under review.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'integrity_appeal'
    and not exists (
      select 1
      from public.integrity_case_appeals appeal
      where appeal.id::text = task.source_id
        and appeal.status in ('submitted', 'under_review')
    );

  insert into public.studio2_organizer_tasks (
    assigned_to, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    appeal.assigned_reviewer,
    'integrity_appeal',
    appeal.id::text,
    'integrity_case_appeals:' || appeal.id::text,
    'integrity.appeal.review',
    'integrity.read',
    'high',
    case when appeal.assigned_reviewer is null then 'waiting' else 'open' end,
    'Integrity appeal needs review',
    'An active appeal remains ' || replace(appeal.status, '_', ' ') || '.',
    '/admin/integrity-appeals',
    appeal.deadline_at,
    jsonb_build_object(
      'table', 'integrity_case_appeals',
      'id', appeal.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array(
        'upheld', 'reduced', 'increased', 'overturned',
        'rejected_late', 'rejected_ineligible'
      )
    ),
    appeal.submitted_at,
    null,
    now(),
    now()
  from public.integrity_case_appeals appeal
  where appeal.status in ('submitted', 'under_review')
  on conflict (source_key) do update set
    assigned_to = excluded.assigned_to,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = excluded.state,
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Break-glass disclosure requests are unresolved while pending or approved.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'identity_disclosure'
    and not exists (
      select 1
      from public.integrity_identity_disclosure_requests disclosure
      where disclosure.id::text = task.source_id
        and disclosure.status in ('pending', 'approved')
    );

  insert into public.studio2_organizer_tasks (
    source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href, due_at,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    'identity_disclosure',
    disclosure.id::text,
    'integrity_identity_disclosure_requests:' || disclosure.id::text,
    'integrity.identity.disclosure',
    'integrity.manage',
    'critical',
    case when disclosure.status = 'approved' then 'waiting' else 'open' end,
    'Protected identity disclosure requires governed handling',
    case
      when disclosure.status = 'approved'
        then 'The disclosure request is approved but has not yet reached a terminal used, rejected or expired state.'
      else 'A sealed-identity disclosure request requires a governed organizer decision.'
    end,
    '/admin/integrity-disclosure',
    disclosure.approval_expires_at,
    jsonb_build_object(
      'table', 'integrity_identity_disclosure_requests',
      'id', disclosure.id,
      'field', 'status',
      'resolvedWhen', jsonb_build_array('rejected', 'used', 'expired')
    ),
    disclosure.requested_at,
    null,
    now(),
    now()
  from public.integrity_identity_disclosure_requests disclosure
  where disclosure.status in ('pending', 'approved')
  on conflict (source_key) do update set
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = excluded.state,
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    due_at = excluded.due_at,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- A paused subsystem is domain state, not a manually dismissible warning.
  update public.studio2_organizer_tasks task
  set
    state = 'resolved',
    resolved_at = coalesce(task.resolved_at, now()),
    last_evaluated_at = now(),
    updated_at = now()
  where task.source_kind = 'subsystem_pause'
    and (p_edition_id is null or task.edition_id = p_edition_id)
    and not exists (
      select 1
      from public.studio2_edition_runtime runtime
      cross join lateral jsonb_each_text(runtime.subsystems) subsystem(key, value)
      where (runtime.edition_id::text || ':' || subsystem.key) = task.source_id
        and subsystem.value = 'paused'
    );

  insert into public.studio2_organizer_tasks (
    edition_id, source_kind, source_id, source_key, task_type,
    required_capability, priority, state, title, description, href,
    resolution_predicate, opened_at, resolved_at, last_evaluated_at, updated_at
  )
  select
    runtime.edition_id,
    'subsystem_pause',
    runtime.edition_id::text || ':' || subsystem.key,
    'studio2_subsystem_pause:' || runtime.edition_id::text || ':' || subsystem.key,
    'edition.subsystem.paused',
    'edition.read',
    'high',
    'open',
    case subsystem.key
      when 'juryVoting' then 'Jury voting is paused'
      when 'televoting' then 'Televoting is paused'
      when 'confirmations' then 'Confirmations are paused'
      when 'submissions' then 'Submissions are paused'
      when 'results' then 'Results are paused'
      when 'predictions' then 'Predictions are paused'
      else 'Edition subsystem is paused'
    end,
    'Resume or deliberately transition the subsystem in the authoritative control surface.',
    '/admin/control-room',
    jsonb_build_object(
      'table', 'studio2_edition_runtime',
      'editionId', runtime.edition_id,
      'subsystem', subsystem.key,
      'resolvedWhen', 'value != paused'
    ),
    runtime.updated_at,
    null,
    now(),
    now()
  from public.studio2_edition_runtime runtime
  cross join lateral jsonb_each_text(runtime.subsystems) subsystem(key, value)
  where subsystem.value = 'paused'
    and (p_edition_id is null or runtime.edition_id = p_edition_id)
  on conflict (source_key) do update set
    edition_id = excluded.edition_id,
    required_capability = excluded.required_capability,
    priority = excluded.priority,
    state = 'open',
    title = excluded.title,
    description = excluded.description,
    href = excluded.href,
    resolution_predicate = excluded.resolution_predicate,
    resolved_at = null,
    last_evaluated_at = now(),
    updated_at = now();

  -- Notification read state is delivery-only. For notifications that refer to a
  -- canonical task source, resolution follows the task's domain truth.
  update public.admin_notifications notification
  set resolved_at = task.resolved_at
  from public.studio2_organizer_tasks task
  where notification.source_key = task.source_key
    and notification.requires_action = true
    and notification.resolved_at is distinct from task.resolved_at;
end
$$;

revoke all on function private.studio2_reconcile_organizer_tasks(uuid)
  from public, anon, authenticated;

create or replace function public.admin_organizer_tasks(
  p_edition_id uuid default null,
  p_filter text default 'all'
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
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
     and not public.studio2_access_allowed('edition.read', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  if p_edition_id is null
     and not public.studio2_access_allowed('edition.read', null, false)
     and not public.studio2_access_allowed('integrity.read', null, false)
     and not public.studio2_access_allowed('incident.read', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_organizer_tasks(p_edition_id);

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
        (v_filter = 'all' and task.state <> 'resolved')
        or (v_filter = 'mine' and task.state <> 'resolved' and task.assigned_to = v_actor)
        or (v_filter = 'waiting' and task.state = 'waiting')
        or (v_filter = 'resolved' and task.state = 'resolved')
      )
  ), '[]'::jsonb);
end
$$;

revoke all on function public.admin_organizer_tasks(uuid, text) from public, anon;
grant execute on function public.admin_organizer_tasks(uuid, text)
  to authenticated, service_role;

create or replace function public.admin_organizer_task_count(
  p_edition_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_edition_id is not null
     and not public.studio2_access_allowed('edition.read', p_edition_id, false) then
    raise exception 'Missing Solaris capability: edition.read' using errcode = '42501';
  end if;

  perform private.studio2_reconcile_organizer_tasks(p_edition_id);

  select count(*)::integer
  into v_count
  from public.studio2_organizer_tasks task
  where task.state <> 'resolved'
    and (p_edition_id is null or task.edition_id is null or task.edition_id = p_edition_id)
    and public.studio2_access_allowed(task.required_capability, task.edition_id, false);

  return v_count;
end
$$;

revoke all on function public.admin_organizer_task_count(uuid) from public, anon;
grant execute on function public.admin_organizer_task_count(uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
