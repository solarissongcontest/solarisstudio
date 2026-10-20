begin;

-- Public V3 / P48 diagnostics: keep one privacy-minimised telemetry store and
-- add only the low-cardinality semantic signals that cannot be reconstructed
-- safely from generic navigation events. Aggregate truth remains server-side.
select public.v3_register_migration_contract(
  '20261020065500_v3_public_ux_diagnostics_metrics',
  1,
  'forward_fix_only',
  false,
  null,
  'Privacy-safe Public UX reformulation, Explore dead-end and feature-hunt metrics'
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
      'explore_dead_end',
      'attention_presented',
      'feature_hunt_detected'
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
      'diagnostic_reason',
      'attention_kind',
      'hunt_source'
    ] = '{}'::jsonb
  );

alter table public.public_ux_events
  add constraint public_ux_events_metadata_diagnostic_reason_check check (
    not (metadata ? 'diagnostic_reason')
    or metadata ->> 'diagnostic_reason' in (
      'empty_collection',
      'not_found',
      'unavailable',
      'blocked',
      'no_public_content',
      'other'
    )
  );

alter table public.public_ux_events
  add constraint public_ux_events_metadata_attention_kind_check check (
    not (metadata ? 'attention_kind')
    or metadata ->> 'attention_kind' in (
      'confirmation',
      'entry',
      'media',
      'jury',
      'televote',
      'notices',
      'account',
      'results',
      'live',
      'other'
    )
  );

alter table public.public_ux_events
  add constraint public_ux_events_metadata_hunt_source_check check (
    not (metadata ? 'hunt_source')
    or metadata ->> 'hunt_source' in ('search', 'navigation', 'explore')
  );

-- New semantic metadata is valid only on the event that owns its meaning. This
-- keeps public inserts categorical instead of creating three new free-form bags.
alter table public.public_ux_events
  add constraint public_ux_events_diagnostic_semantics_check check (
    (
      event_name = 'explore_dead_end'
      and metadata ? 'diagnostic_reason'
      and not (metadata ? 'attention_kind')
      and not (metadata ? 'hunt_source')
    )
    or (
      event_name = 'attention_presented'
      and metadata ? 'attention_kind'
      and not (metadata ? 'diagnostic_reason')
      and not (metadata ? 'hunt_source')
    )
    or (
      event_name = 'feature_hunt_detected'
      and metadata ? 'attention_kind'
      and metadata ? 'hunt_source'
      and not (metadata ? 'diagnostic_reason')
    )
    or (
      event_name not in ('explore_dead_end', 'attention_presented', 'feature_hunt_detected')
      and not (metadata ? 'diagnostic_reason')
      and not (metadata ? 'attention_kind')
      and not (metadata ? 'hunt_source')
    )
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
  v_result jsonb;
begin
  if not public.studio2_access_allowed('rollout.manage', null, false) then
    raise exception 'Organizer role required' using errcode = '42501';
  end if;

  with scoped as (
    select *
    from public.public_ux_events
    where created_at >= v_since
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
  search_sequence_base as (
    select
      session_id,
      created_at,
      id,
      case
        when metadata ->> 'query_length' ~ '^[0-9]{1,4}$'
          then (metadata ->> 'query_length')::integer
        else null
      end as query_length,
      case
        when metadata ->> 'result_count' ~ '^[0-9]{1,6}$'
          then (metadata ->> 'result_count')::integer
        else null
      end as result_count
    from scoped
    where event_name = 'search_submitted'
  ),
  search_sequence as (
    select
      search_sequence_base.*,
      row_number() over (
        partition by session_id
        order by created_at, id
      ) as submission_ordinal,
      lag(query_length) over (
        partition by session_id
        order by created_at, id
      ) as previous_query_length,
      lag(result_count) over (
        partition by session_id
        order by created_at, id
      ) as previous_result_count
    from search_sequence_base
  ),
  search_reformulation_by_session as (
    select
      session_id,
      count(*) filter (
        where submission_ordinal > 1
          and (
            (
              query_length is not null
              and previous_query_length is not null
              and query_length <> previous_query_length
            )
            or (
              result_count is not null
              and previous_result_count is not null
              and result_count <> previous_result_count
            )
          )
      )::integer as transitions
    from search_sequence
    group by session_id
  ),
  search_diagnostics as (
    select
      count(*)::integer as search_sessions,
      count(*) filter (where transitions > 0)::integer as reformulation_sessions,
      coalesce(sum(transitions), 0)::integer as reformulation_transitions
    from search_reformulation_by_session
  ),
  explore_diagnostics as (
    select
      count(distinct session_id) filter (
        where event_name = 'explore_dead_end'
           or pathname = '/explore'
           or pathname like '/explore/%'
           or target = '/explore'
           or target like '/explore/%'
      )::integer as explore_sessions,
      count(distinct session_id) filter (
        where event_name = 'explore_dead_end'
      )::integer as dead_end_sessions,
      count(*) filter (
        where event_name = 'explore_dead_end'
      )::integer as dead_end_events
    from scoped
  ),
  attention_diagnostics as (
    select
      count(distinct session_id) filter (
        where event_name = 'attention_presented'
      )::integer as attention_sessions,
      count(distinct session_id) filter (
        where event_name = 'feature_hunt_detected'
      )::integer as feature_hunt_sessions,
      count(*) filter (
        where event_name = 'feature_hunt_detected'
      )::integer as feature_hunt_events
    from scoped
  )
  select jsonb_build_object(
    'since', v_since,
    'generatedAt', now(),
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
      'searchReformulation', jsonb_build_object(
        'method', 'privacy_safe_sequence_proxy',
        'searchSessions', search_diagnostics.search_sessions,
        'reformulationSessions', search_diagnostics.reformulation_sessions,
        'reformulationTransitions', search_diagnostics.reformulation_transitions,
        'ratePct', case
          when search_diagnostics.search_sessions > 0
            then round(
              (search_diagnostics.reformulation_sessions::numeric
                / search_diagnostics.search_sessions::numeric) * 100,
              1
            )
          else 0
        end
      ),
      'exploreDeadEnds', jsonb_build_object(
        'exploreSessions', explore_diagnostics.explore_sessions,
        'deadEndSessions', explore_diagnostics.dead_end_sessions,
        'deadEndEvents', explore_diagnostics.dead_end_events,
        'ratePct', case
          when explore_diagnostics.explore_sessions > 0
            then round(
              (explore_diagnostics.dead_end_sessions::numeric
                / explore_diagnostics.explore_sessions::numeric) * 100,
              1
            )
          else 0
        end,
        'reasons', coalesce((
          select jsonb_agg(row_to_json(x) order by x.sessions desc, x.reason)
          from (
            select
              metadata ->> 'diagnostic_reason' as reason,
              count(distinct session_id)::integer as sessions,
              count(*)::integer as events
            from scoped
            where event_name = 'explore_dead_end'
            group by metadata ->> 'diagnostic_reason'
          ) x
        ), '[]'::jsonb)
      ),
      'featureHunt', jsonb_build_object(
        'attentionSessions', attention_diagnostics.attention_sessions,
        'featureHuntSessions', attention_diagnostics.feature_hunt_sessions,
        'featureHuntEvents', attention_diagnostics.feature_hunt_events,
        'ratePct', case
          when attention_diagnostics.attention_sessions > 0
            then round(
              (least(
                attention_diagnostics.feature_hunt_sessions,
                attention_diagnostics.attention_sessions
              )::numeric / attention_diagnostics.attention_sessions::numeric) * 100,
              1
            )
          else 0
        end,
        'byAttentionKind', coalesce((
          select jsonb_agg(row_to_json(x) order by x.sessions desc, x.attention_kind)
          from (
            select
              metadata ->> 'attention_kind' as attention_kind,
              count(distinct session_id)::integer as sessions,
              count(*)::integer as events
            from scoped
            where event_name = 'feature_hunt_detected'
            group by metadata ->> 'attention_kind'
          ) x
        ), '[]'::jsonb),
        'bySource', coalesce((
          select jsonb_agg(row_to_json(x) order by x.sessions desc, x.hunt_source)
          from (
            select
              metadata ->> 'hunt_source' as hunt_source,
              count(distinct session_id)::integer as sessions,
              count(*)::integer as events
            from scoped
            where event_name = 'feature_hunt_detected'
            group by metadata ->> 'hunt_source'
          ) x
        ), '[]'::jsonb)
      )
    )
  )
  into v_result
  from search_diagnostics, explore_diagnostics, attention_diagnostics;

  return v_result;
end
$metrics$;

revoke all on function public.admin_public_ux_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_ux_metrics(timestamptz)
  to authenticated;

comment on function public.admin_public_ux_metrics(timestamptz) is
  'Organizer-only bounded Public UX aggregates. Search reformulation is a privacy-safe sequence proxy; Explore dead-end and feature-hunt metrics require explicit low-cardinality semantic events.';

notify pgrst, 'reload schema';

commit;
