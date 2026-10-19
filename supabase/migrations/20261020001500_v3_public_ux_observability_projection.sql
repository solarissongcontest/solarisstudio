begin;

-- Public/Organizer V3 observability completion for System request #753.
--
-- This extends the existing privacy-minimised telemetry store rather than
-- creating a second analytics authority. Browser consumers still receive only
-- bounded aggregates; raw session journeys remain inside the database.
select public.v3_register_migration_contract(
  '20261020001500_v3_public_ux_observability_projection',
  1,
  'forward_fix_only',
  false,
  null,
  'Complete the bounded privacy-safe Public UX projection with backtracking, dead-end, abandonment and error-class aggregates'
);

alter table public.public_ux_events
  drop constraint if exists public_ux_events_event_name_check;

alter table public.public_ux_events
  add constraint public_ux_events_event_name_check check (
    event_name in (
      'public_nav_clicked',
      'section_nav_clicked',
      'search_opened',
      'search_submitted',
      'search_result_clicked',
      'search_no_results',
      'breadcrumb_clicked',
      'advanced_section_opened',
      'task_started',
      'task_completed',
      'hub_primary_clicked',
      'app_tab_restored',
      'app_cold_launch_restored',
      'app_resumed',
      'app_offline_recovered',
      'app_push_opened',
      'app_show_mode_state',
      'app_task_resumed',
      'public_error_shown'
    )
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_metadata_keys_check;

alter table public.public_ux_events
  add constraint public_ux_events_metadata_keys_check check (
    metadata - array[
      'device',
      'area',
      'group',
      'query_length',
      'result_count',
      'source',
      'visibility',
      'task_status',
      'interaction',
      'beta_task',
      'task_run',
      'elapsed_ms',
      'start_route',
      'search_used',
      'error_class'
    ] = '{}'::jsonb
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_metadata_text_lengths_check;

alter table public.public_ux_events
  add constraint public_ux_events_metadata_text_lengths_check check (
    coalesce(length(metadata ->> 'area'), 0) <= 120
    and coalesce(length(metadata ->> 'group'), 0) <= 120
    and coalesce(length(metadata ->> 'source'), 0) <= 120
    and coalesce(length(metadata ->> 'visibility'), 0) <= 120
    and coalesce(length(metadata ->> 'task_status'), 0) <= 120
    and coalesce(length(metadata ->> 'interaction'), 0) <= 120
    and coalesce(length(metadata ->> 'beta_task'), 0) <= 120
    and coalesce(length(metadata ->> 'task_run'), 0) <= 120
    and coalesce(length(metadata ->> 'error_class'), 0) <= 120
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_metadata_error_class_check;

alter table public.public_ux_events
  add constraint public_ux_events_metadata_error_class_check check (
    not (metadata ? 'error_class')
    or metadata ->> 'error_class' in (
      'offline',
      'service-unavailable',
      'authentication-expired',
      'permission-denied',
      'conflict',
      'not-found',
      'unpublished',
      'request-failed',
      'unexpected'
    )
  );

alter table public.public_ux_events
  drop constraint if exists public_ux_events_error_event_shape_check;

alter table public.public_ux_events
  add constraint public_ux_events_error_event_shape_check check (
    event_name <> 'public_error_shown'
    or metadata ? 'error_class'
  );

create or replace function public.admin_public_ux_metrics(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $metrics$
declare
  v_since timestamptz := greatest(
    coalesce(p_since, now() - interval '30 days'),
    now() - interval '180 days'
  );
  v_now timestamptz := now();
  v_result jsonb;
begin
  if not public.studio2_access_allowed('rollout.manage', null, false) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  with scoped as materialized (
    select
      id,
      created_at,
      session_id,
      user_id,
      event_name,
      pathname,
      target,
      metadata
    from public.public_ux_events
    where created_at >= v_since
      and created_at <= v_now
  ),
  session_summary as (
    select
      session_id,
      count(*) filter (
        where event_name in ('public_nav_clicked', 'section_nav_clicked', 'breadcrumb_clicked')
      ) as navigation_steps,
      count(*) filter (where event_name = 'search_no_results') as no_results,
      count(*) filter (where event_name = 'search_result_clicked') as search_clicks
    from scoped
    group by session_id
  ),
  first_navigation as (
    select distinct on (session_id)
      session_id,
      target,
      metadata ->> 'area' as area
    from scoped
    where event_name = 'public_nav_clicked'
    order by session_id, created_at, id
  ),
  task_counts as (
    select
      coalesce(metadata ->> 'beta_task', target, 'unknown') as task_key,
      count(*) filter (where event_name = 'task_started') as started,
      count(*) filter (where event_name = 'task_completed') as completed
    from scoped
    where event_name in ('task_started', 'task_completed')
    group by coalesce(metadata ->> 'beta_task', target, 'unknown')
  ),
  navigation_base as (
    select
      session_id,
      created_at,
      id,
      left(coalesce(nullif(target, ''), pathname), 512) as destination
    from scoped
    where event_name in ('public_nav_clicked', 'section_nav_clicked', 'breadcrumb_clicked')
  ),
  navigation_sequence as (
    select
      session_id,
      created_at,
      id,
      destination,
      lag(destination) over (
        partition by session_id
        order by created_at, id
      ) as previous_destination,
      row_number() over (
        partition by session_id, destination
        order by created_at, id
      ) as destination_visit
    from navigation_base
  ),
  backtrack_events as (
    select *
    from navigation_sequence
    where destination_visit > 1
      and previous_destination is distinct from destination
  ),
  session_last as (
    select distinct on (session_id)
      session_id,
      created_at,
      event_name,
      pathname,
      metadata ->> 'error_class' as error_class
    from scoped
    order by session_id, created_at desc, id desc
  ),
  dead_end_sessions as (
    select
      session_id,
      pathname,
      case
        when event_name = 'search_no_results' then 'search_no_results'
        else coalesce(error_class, 'unexpected')
      end as source
    from session_last
    where created_at <= v_now - interval '2 minutes'
      and event_name in ('search_no_results', 'public_error_shown')
  ),
  task_starts as (
    select distinct on (metadata ->> 'task_run')
      metadata ->> 'task_run' as task_run,
      coalesce(metadata ->> 'beta_task', target, 'unknown') as task_key,
      created_at as started_at
    from scoped
    where event_name = 'task_started'
      and coalesce(metadata ->> 'task_run', '') <> ''
    order by metadata ->> 'task_run', created_at, id
  ),
  task_completions as (
    select
      metadata ->> 'task_run' as task_run,
      min(created_at) as completed_at
    from scoped
    where event_name = 'task_completed'
      and coalesce(metadata ->> 'task_run', '') <> ''
    group by metadata ->> 'task_run'
  ),
  task_outcomes as (
    select
      start.task_key,
      start.task_run,
      start.started_at,
      completion.completed_at,
      not (
        completion.completed_at is not null
        and completion.completed_at >= start.started_at
        and completion.completed_at <= start.started_at + interval '30 minutes'
      ) as abandoned
    from task_starts start
    left join task_completions completion using (task_run)
    where start.started_at <= v_now - interval '30 minutes'
  ),
  error_events as (
    select
      pathname,
      coalesce(metadata ->> 'error_class', 'unexpected') as error_class
    from scoped
    where event_name = 'public_error_shown'
  )
  select jsonb_build_object(
    'schemaVersion', 2,
    'since', v_since,
    'generatedAt', v_now,
    'totals', jsonb_build_object(
      'events', (select count(*) from scoped),
      'sessions', (select count(distinct session_id) from scoped),
      'users', (select count(distinct user_id) from scoped where user_id is not null)
    ),
    'navigation', jsonb_build_object(
      'topDestinations', coalesce((
        select jsonb_agg(row_to_json(x))
        from (
          select target, count(*)::int as count
          from scoped
          where event_name in ('public_nav_clicked', 'section_nav_clicked', 'breadcrumb_clicked')
            and target is not null
          group by target
          order by count(*) desc, target
          limit 15
        ) x
      ), '[]'::jsonb),
      'firstClicks', coalesce((
        select jsonb_agg(row_to_json(x))
        from (
          select coalesce(area, target, 'unknown') as destination, count(*)::int as count
          from first_navigation
          group by coalesce(area, target, 'unknown')
          order by count(*) desc, destination
        ) x
      ), '[]'::jsonb)
    ),
    'search', jsonb_build_object(
      'opened', (select count(*) from scoped where event_name = 'search_opened'),
      'submitted', (select count(*) from scoped where event_name = 'search_submitted'),
      'noResults', (select count(*) from scoped where event_name = 'search_no_results'),
      'resultClicks', (select count(*) from scoped where event_name = 'search_result_clicked'),
      'clickedGroups', coalesce((
        select jsonb_agg(row_to_json(x))
        from (
          select coalesce(metadata ->> 'group', 'Unknown') as group_name, count(*)::int as count
          from scoped
          where event_name = 'search_result_clicked'
          group by coalesce(metadata ->> 'group', 'Unknown')
          order by count(*) desc, group_name
          limit 12
        ) x
      ), '[]'::jsonb),
      'queryLengthBuckets', coalesce((
        select jsonb_agg(row_to_json(x))
        from (
          select
            case
              when coalesce(nullif(metadata ->> 'query_length', '')::int, 0) <= 3 then '1-3'
              when coalesce(nullif(metadata ->> 'query_length', '')::int, 0) <= 8 then '4-8'
              when coalesce(nullif(metadata ->> 'query_length', '')::int, 0) <= 20 then '9-20'
              else '21+'
            end as bucket,
            count(*)::int as count
          from scoped
          where event_name = 'search_submitted'
          group by 1
          order by min(coalesce(nullif(metadata ->> 'query_length', '')::int, 0))
        ) x
      ), '[]'::jsonb),
      'rescueSessions', (
        select count(*)::int
        from session_summary
        where no_results > 0 and search_clicks > 0
      )
    ),
    'friction', jsonb_build_object(
      'highStepSessions', (
        select count(*)::int
        from session_summary
        where navigation_steps >= 8
      ),
      'repeatedSectionSessions', (
        select count(*)::int
        from (
          select session_id
          from scoped
          where event_name = 'public_nav_clicked'
          group by session_id
          having count(*) >= 4
        ) y
      )
    ),
    'tasks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'target', task_key,
          'started', started,
          'completed', completed,
          'completionRate',
          case
            when started > 0
              then round((completed::numeric / started::numeric) * 100, 1)
            else 0
          end
        )
        order by started desc, task_key
      )
      from task_counts
    ), '[]'::jsonb),
    'devices', coalesce((
      select jsonb_agg(row_to_json(x))
      from (
        select coalesce(metadata ->> 'device', 'unknown') as device, count(*)::int as count
        from scoped
        group by coalesce(metadata ->> 'device', 'unknown')
        order by count(*) desc, device
      ) x
    ), '[]'::jsonb),
    'diagnostics', jsonb_build_object(
      'definitions', jsonb_build_object(
        'routeBacktracking', 'A measured navigation destination revisited after at least one different measured navigation destination in the same telemetry session.',
        'deadEnds', 'A telemetry session whose final measured event is a no-result search or classified public error and remains terminal for at least two minutes.',
        'workflowAbandonment', 'A measured task run without task completion within thirty minutes of its first task-start event.',
        'errorClasses', 'Low-cardinality Solaris public error classes emitted by the root public error boundary without error text or stack traces.'
      ),
      'routeBacktracking', jsonb_build_object(
        'sessions', (select count(distinct session_id)::int from backtrack_events),
        'events', (select count(*)::int from backtrack_events),
        'topDestinations', coalesce((
          select jsonb_agg(row_to_json(x))
          from (
            select destination, count(*)::int as count
            from backtrack_events
            group by destination
            order by count(*) desc, destination
            limit 15
          ) x
        ), '[]'::jsonb)
      ),
      'deadEnds', jsonb_build_object(
        'sessions', (select count(*)::int from dead_end_sessions),
        'topRoutes', coalesce((
          select jsonb_agg(row_to_json(x))
          from (
            select pathname, source, count(*)::int as count
            from dead_end_sessions
            group by pathname, source
            order by count(*) desc, pathname, source
            limit 15
          ) x
        ), '[]'::jsonb)
      ),
      'workflowAbandonment', jsonb_build_object(
        'windowMinutes', 30,
        'eligibleStarts', (select count(*)::int from task_outcomes),
        'abandoned', (select count(*)::int from task_outcomes where abandoned),
        'tasks', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'target', task_key,
              'eligibleStarts', eligible_starts,
              'abandoned', abandoned_count,
              'abandonmentRate',
              case
                when eligible_starts > 0
                  then round((abandoned_count::numeric / eligible_starts::numeric) * 100, 1)
                else 0
              end
            )
            order by abandoned_count desc, eligible_starts desc, task_key
          )
          from (
            select
              task_key,
              count(*)::int as eligible_starts,
              count(*) filter (where abandoned)::int as abandoned_count
            from task_outcomes
            group by task_key
            order by abandoned_count desc, eligible_starts desc, task_key
            limit 20
          ) x
        ), '[]'::jsonb)
      ),
      'errors', jsonb_build_object(
        'total', (select count(*)::int from error_events),
        'classes', coalesce((
          select jsonb_agg(row_to_json(x))
          from (
            select error_class, count(*)::int as count
            from error_events
            group by error_class
            order by count(*) desc, error_class
            limit 12
          ) x
        ), '[]'::jsonb),
        'routes', coalesce((
          select jsonb_agg(row_to_json(x))
          from (
            select pathname, error_class, count(*)::int as count
            from error_events
            group by pathname, error_class
            order by count(*) desc, pathname, error_class
            limit 20
          ) x
        ), '[]'::jsonb)
      )
    )
  )
  into v_result;

  return v_result;
end
$metrics$;

revoke all on function public.admin_public_ux_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_ux_metrics(timestamptz)
  to authenticated;

comment on function public.admin_public_ux_metrics(timestamptz) is
  'Schema v2 bounded Public UX aggregate projection. Returns no raw session journeys, search text, form contents, votes, messages, integrity evidence, stack traces or arbitrary error text.';

notify pgrst, 'reload schema';

commit;
