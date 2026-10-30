begin;

-- V3 canonical Task read contract.
--
-- The existing Organisation OS V5 Task Engine remains the only persisted
-- Organizer task projection and the complete reconciler remains its owner.
-- This migration adds a bounded, server-classified V3 read contract over that
-- projection. It deliberately does NOT replace studio2_runtime_contract() or
-- any reconciler wrapper: later migrations have already extended those objects.
select public.v3_register_migration_contract(
  'v3.tasks.canonical-read',
  1,
  'forward_fix_only',
  false,
  null,
  'Canonical V3 task read projection over reconciled domain truth'
);

create or replace function private.studio2_organizer_task_v3_payload(
  p_task public.studio2_organizer_tasks,
  p_now timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public, private
as $task_payload$
declare
  v_explicit_state text := lower(nullif(btrim(p_task.resolution_predicate ->> 'operationalState'), ''));
  v_operational_state text;
  v_action_required boolean;
  v_blocking boolean;
  v_urgency text := lower(nullif(btrim(p_task.resolution_predicate ->> 'urgency'), ''));
  v_impact text := lower(nullif(btrim(p_task.resolution_predicate ->> 'impact'), ''));
  v_delivery_class text := lower(nullif(btrim(p_task.resolution_predicate ->> 'deliveryClass'), ''));
  v_why text := nullif(btrim(p_task.resolution_predicate ->> 'why'), '');
  v_opens_at text := nullif(btrim(p_task.resolution_predicate ->> 'opensAt'), '');
  v_expires_at text := nullif(btrim(p_task.resolution_predicate ->> 'expiresAt'), '');
  v_primary_action jsonb;
begin
  if v_explicit_state is not null
     and v_explicit_state not in (
       'actionable', 'in_progress', 'blocked', 'waiting', 'failed',
       'overdue', 'expired', 'superseded', 'resolved'
     ) then
    v_explicit_state := null;
  end if;

  if p_task.state = 'resolved' then
    if v_explicit_state in ('expired', 'superseded') then
      v_operational_state := v_explicit_state;
    else
      v_operational_state := 'resolved';
    end if;
  elsif v_explicit_state is not null then
    v_operational_state := v_explicit_state;
  elsif p_task.state = 'waiting' then
    v_operational_state := 'waiting';
  elsif p_task.task_type ~* '(^|[._-])(failed|failure|error|recovery)([._-]|$)'
     or p_task.source_kind in (
       'integration_link_error',
       'integration_failure',
       'system_job',
       'confirmation_sync'
     ) then
    v_operational_state := 'failed';
  elsif v_expires_at is not null
     and v_expires_at::timestamptz <= p_now then
    v_operational_state := 'expired';
  elsif p_task.due_at is not null and p_task.due_at <= p_now then
    v_operational_state := 'overdue';
  else
    v_operational_state := 'actionable';
  end if;

  if jsonb_typeof(p_task.resolution_predicate -> 'actionRequired') = 'boolean' then
    v_action_required := (p_task.resolution_predicate ->> 'actionRequired')::boolean;
  else
    v_action_required := v_operational_state in (
      'actionable', 'in_progress', 'failed', 'overdue'
    );
  end if;

  if jsonb_typeof(p_task.resolution_predicate -> 'blocking') = 'boolean' then
    v_blocking := (p_task.resolution_predicate ->> 'blocking')::boolean;
  else
    v_blocking := p_task.task_type in ('confirmation.required', 'media.required');
  end if;

  if v_urgency not in ('none', 'low', 'medium', 'high', 'immediate') then
    v_urgency := null;
  end if;
  if v_urgency is null then
    v_urgency := case
      when v_operational_state in ('overdue', 'expired') then 'immediate'
      when p_task.priority = 'critical' then 'immediate'
      when p_task.due_at is not null and p_task.due_at <= p_now + interval '1 hour' then 'immediate'
      when p_task.due_at is not null and p_task.due_at <= p_now + interval '24 hours' then 'high'
      when p_task.priority = 'high' then 'high'
      when p_task.due_at is not null and p_task.due_at <= p_now + interval '72 hours' then 'medium'
      else 'low'
    end;
  end if;

  if v_impact not in ('low', 'medium', 'high', 'critical') then
    v_impact := null;
  end if;
  if v_impact is null then
    v_impact := case p_task.priority
      when 'critical' then 'critical'
      when 'high' then 'high'
      else 'medium'
    end;
  end if;

  if v_delivery_class not in ('required', 'recommended', 'optional') then
    v_delivery_class := null;
  end if;
  if v_delivery_class is null then
    v_delivery_class := case
      when v_blocking or p_task.priority in ('critical', 'high') then 'required'
      else 'recommended'
    end;
  end if;

  if v_why is null then
    v_why := p_task.description;
  end if;

  if v_operational_state not in ('resolved', 'expired', 'superseded') then
    v_primary_action := jsonb_build_object(
      'kind', 'navigate',
      'label', case
        when v_operational_state = 'failed' then 'Review failure'
        when v_operational_state = 'blocked' then 'Review blocker'
        when v_operational_state = 'waiting' then 'Review dependency'
        else 'Review'
      end,
      'route', p_task.href
    );
  else
    v_primary_action := null;
  end if;

  return jsonb_build_object(
    'id', p_task.id,
    'dedupeKey', p_task.source_key,
    'editionId', p_task.edition_id,
    'showId', nullif(btrim(p_task.resolution_predicate ->> 'showId'), ''),
    'countryId', p_task.country_id,
    'subjectType', coalesce(
      nullif(btrim(p_task.resolution_predicate ->> 'subjectType'), ''),
      p_task.source_kind
    ),
    'subjectId', coalesce(
      nullif(btrim(p_task.resolution_predicate ->> 'subjectId'), ''),
      p_task.source_id
    ),
    'sourceKind', p_task.source_kind,
    'sourceKey', p_task.source_key,
    'taskType', p_task.task_type,
    'requiredCapability', p_task.required_capability,
    'sourceState', p_task.state,
    'operationalState', v_operational_state,
    'actionRequired', v_action_required,
    'blocking', v_blocking,
    'urgency', v_urgency,
    'impact', v_impact,
    'deliveryClass', v_delivery_class,
    'priority', p_task.priority,
    'title', p_task.title,
    'description', p_task.description,
    'why', v_why,
    'route', p_task.href,
    'href', p_task.href,
    'primaryAction', v_primary_action,
    'assignedTo', p_task.assigned_to,
    'opensAt', coalesce(v_opens_at, p_task.opened_at::text),
    'deadline', p_task.due_at,
    'dueAt', p_task.due_at,
    'expiresAt', v_expires_at,
    'openedAt', p_task.opened_at,
    'resolvedAt', p_task.resolved_at,
    'lastEvaluatedAt', p_task.last_evaluated_at,
    'stateVersion', p_task.updated_at,
    'resolutionPredicate', p_task.resolution_predicate,
    'ruleReference', to_jsonb(p_task.rule_reference),
    'resolutionEvidence', jsonb_build_object(
      'sourceState', p_task.state,
      'resolvedAt', p_task.resolved_at,
      'lastEvaluatedAt', p_task.last_evaluated_at,
      'predicate', p_task.resolution_predicate
    )
  );
exception
  when invalid_datetime_format then
    raise exception 'Invalid task expiresAt timestamp for source key %', p_task.source_key
      using errcode = '22007';
end
$task_payload$;

revoke all on function private.studio2_organizer_task_v3_payload(
  public.studio2_organizer_tasks,
  timestamptz
) from public, anon, authenticated;

comment on function private.studio2_organizer_task_v3_payload(
  public.studio2_organizer_tasks,
  timestamptz
) is
  'Pure server-side semantic classifier for the canonical Organizer Task projection. It never mutates task/domain state.';

create or replace function public.admin_organizer_tasks_v3(
  p_edition_id uuid,
  p_filter text default 'all',
  p_limit integer default 100,
  p_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $tasks_v3$
declare
  v_actor uuid := auth.uid();
  v_filter text := lower(btrim(coalesce(p_filter, 'all')));
  v_limit integer := coalesce(p_limit, 100);
  v_offset integer := coalesce(p_offset, 0);
  v_now timestamptz := now();
  v_items jsonb := '[]'::jsonb;
  v_summary jsonb := '{}'::jsonb;
  v_filtered_count integer := 0;
  v_state_version text := md5('empty');
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_edition_id is null then
    raise exception 'Organizer Tasks V3 require an explicit edition' using errcode = '22023';
  end if;
  if v_filter not in (
    'all', 'needs_action', 'actionable', 'in_progress', 'blocked', 'waiting',
    'failed', 'overdue', 'expired', 'superseded', 'mine', 'resolved', 'recent_resolved'
  ) then
    raise exception 'Unknown Organizer Tasks V3 filter: %', v_filter using errcode = '22023';
  end if;
  if v_limit < 1 or v_limit > 200 then
    raise exception 'Organizer Tasks V3 limit must be between 1 and 200' using errcode = '22023';
  end if;
  if v_offset < 0 or v_offset > 5000 then
    raise exception 'Organizer Tasks V3 offset must be between 0 and 5000' using errcode = '22023';
  end if;

  if not public.studio2_access_allowed('edition.read', p_edition_id, false)
     and not public.studio2_access_allowed('permissions.manage', null, false) then
    raise exception 'Organizer task access required' using errcode = '42501';
  end if;

  -- This is the one canonical reconciliation entry point. The V3 read contract
  -- never writes task rows itself and therefore cannot become a second writer.
  perform private.studio2_reconcile_all_organizer_tasks(p_edition_id);

  with projected as materialized (
    select
      task.*,
      projection.payload,
      case projection.payload ->> 'operationalState'
        when 'blocked' then 1
        when 'failed' then 2
        when 'overdue' then 3
        when 'actionable' then 4
        when 'in_progress' then 5
        when 'waiting' then 6
        when 'expired' then 7
        when 'superseded' then 8
        else 9
      end as operational_rank,
      case task.priority when 'critical' then 1 when 'high' then 2 else 3 end as priority_rank
    from public.studio2_organizer_tasks task
    cross join lateral (
      select private.studio2_organizer_task_v3_payload(task, v_now) as payload
    ) projection
    where (task.edition_id = p_edition_id or task.edition_id is null)
      and public.studio2_access_allowed(task.required_capability, task.edition_id, false)
      and (
        task.source_kind not in ('permission_approval', 'permission_approval_apply')
        or task.assigned_to = v_actor
      )
  ),
  filtered as materialized (
    select *
    from projected item
    where case v_filter
      when 'all' then item.payload ->> 'operationalState' not in ('resolved', 'expired', 'superseded')
      when 'needs_action' then coalesce((item.payload ->> 'actionRequired')::boolean, false)
      when 'actionable' then item.payload ->> 'operationalState' in ('actionable', 'in_progress')
      when 'in_progress' then item.payload ->> 'operationalState' = 'in_progress'
      when 'blocked' then item.payload ->> 'operationalState' = 'blocked'
      when 'waiting' then item.payload ->> 'operationalState' = 'waiting'
      when 'failed' then item.payload ->> 'operationalState' = 'failed'
      when 'overdue' then item.payload ->> 'operationalState' in ('overdue', 'expired')
      when 'expired' then item.payload ->> 'operationalState' = 'expired'
      when 'superseded' then item.payload ->> 'operationalState' = 'superseded'
      when 'mine' then item.payload ->> 'operationalState' not in ('resolved', 'expired', 'superseded')
        and item.assigned_to = v_actor
      when 'resolved' then item.payload ->> 'operationalState' in ('resolved', 'expired', 'superseded')
      when 'recent_resolved' then item.payload ->> 'operationalState' in ('resolved', 'expired', 'superseded')
        and item.resolved_at >= v_now - interval '30 days'
      else false
    end
  ),
  page as materialized (
    select *
    from filtered
    order by operational_rank, priority_rank, due_at asc nulls last, opened_at asc, source_key asc
    limit v_limit
    offset v_offset
  ),
  stats as (
    select jsonb_build_object(
      'total', count(*),
      'unresolved', count(*) filter (
        where payload ->> 'operationalState' not in ('resolved', 'expired', 'superseded')
      ),
      'actionable', count(*) filter (where payload ->> 'operationalState' = 'actionable'),
      'inProgress', count(*) filter (where payload ->> 'operationalState' = 'in_progress'),
      'blocked', count(*) filter (where payload ->> 'operationalState' = 'blocked'),
      'waiting', count(*) filter (where payload ->> 'operationalState' = 'waiting'),
      'failed', count(*) filter (where payload ->> 'operationalState' = 'failed'),
      'overdue', count(*) filter (where payload ->> 'operationalState' = 'overdue'),
      'expired', count(*) filter (where payload ->> 'operationalState' = 'expired'),
      'superseded', count(*) filter (where payload ->> 'operationalState' = 'superseded'),
      'resolved', count(*) filter (where payload ->> 'operationalState' = 'resolved'),
      'blocking', count(*) filter (where coalesce((payload ->> 'blocking')::boolean, false)),
      'needsAction', count(*) filter (where coalesce((payload ->> 'actionRequired')::boolean, false))
    ) as summary
    from projected
  ),
  versioned as (
    select md5(coalesce(string_agg(
      item.id::text || ':' || item.updated_at::text || ':' || (item.payload ->> 'operationalState'),
      '|' order by item.id
    ), 'empty')) as state_version
    from projected item
  )
  select
    coalesce((select jsonb_agg(
      page.payload order by page.operational_rank, page.priority_rank,
      page.due_at asc nulls last, page.opened_at asc, page.source_key asc
    ) from page), '[]'::jsonb),
    (select summary from stats),
    (select count(*)::integer from filtered),
    (select state_version from versioned)
  into v_items, v_summary, v_filtered_count, v_state_version;

  return jsonb_build_object(
    'schemaVersion', 1,
    'editionId', p_edition_id,
    'filter', v_filter,
    'items', v_items,
    'summary', v_summary,
    'pagination', jsonb_build_object(
      'limit', v_limit,
      'offset', v_offset,
      'total', v_filtered_count,
      'hasMore', v_offset + jsonb_array_length(v_items) < v_filtered_count,
      'nextOffset', case
        when v_offset + jsonb_array_length(v_items) < v_filtered_count
        then v_offset + jsonb_array_length(v_items)
        else null
      end
    ),
    'stateVersion', v_state_version,
    'serverTime', v_now,
    'authoritativeSource', 'studio2_organizer_tasks',
    'reconciled', true
  );
end
$tasks_v3$;

revoke all on function public.admin_organizer_tasks_v3(uuid, text, integer, integer)
  from public, anon;
grant execute on function public.admin_organizer_tasks_v3(uuid, text, integer, integer)
  to authenticated;

comment on function public.admin_organizer_tasks_v3(uuid, text, integer, integer) is
  'Canonical V3 Organizer Task read contract. Reconciles through the single Task Engine owner, applies capability scope, and returns server-classified bounded task truth.';

create or replace function public.admin_organizer_task_count_v3(
  p_edition_id uuid
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $task_count_v3$
declare
  v_projection jsonb;
begin
  v_projection := public.admin_organizer_tasks_v3(p_edition_id, 'all', 1, 0);
  return coalesce((v_projection #>> '{summary,unresolved}')::integer, 0);
end
$task_count_v3$;

revoke all on function public.admin_organizer_task_count_v3(uuid)
  from public, anon;
grant execute on function public.admin_organizer_task_count_v3(uuid)
  to authenticated;

comment on function public.admin_organizer_task_count_v3(uuid) is
  'Canonical unresolved Organizer Task count derived from the V3 task projection.';

notify pgrst, 'reload schema';

commit;
