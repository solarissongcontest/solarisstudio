begin;

create table if not exists public.public_ux_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  pathname text not null,
  target text,
  metadata jsonb not null default '{}'::jsonb,
  constraint public_ux_events_event_name_check check (
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
      'hub_primary_clicked'
    )
  ),
  constraint public_ux_events_session_id_check check (
    length(session_id) between 8 and 128
  ),
  constraint public_ux_events_pathname_check check (
    length(pathname) between 1 and 512 and pathname like '/%'
  ),
  constraint public_ux_events_target_check check (
    target is null or length(target) <= 512
  ),
  constraint public_ux_events_metadata_object_check check (
    jsonb_typeof(metadata) = 'object'
  ),
  constraint public_ux_events_metadata_size_check check (
    octet_length(metadata::text) <= 4096
  )
);

alter table public.public_ux_events enable row level security;

revoke all on table public.public_ux_events from public, anon, authenticated;
grant all on table public.public_ux_events to service_role;

create index if not exists public_ux_events_created_at_idx
  on public.public_ux_events (created_at desc);

create index if not exists public_ux_events_event_created_idx
  on public.public_ux_events (event_name, created_at desc);

create index if not exists public_ux_events_session_created_idx
  on public.public_ux_events (session_id, created_at);

create or replace function public.record_public_ux_event(
  p_event_name text,
  p_session_id text,
  p_pathname text,
  p_target text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_event_name text := btrim(coalesce(p_event_name, ''));
  v_session_id text := btrim(coalesce(p_session_id, ''));
  v_pathname text := btrim(coalesce(p_pathname, ''));
  v_target text := nullif(btrim(coalesce(p_target, '')), '');
  v_metadata jsonb := coalesce(p_metadata, '{}'::jsonb);
begin
  if v_event_name not in (
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
    'hub_primary_clicked'
  ) then
    raise exception 'Unsupported public UX event'
      using errcode = '22023';
  end if;

  if length(v_session_id) not between 8 and 128 then
    raise exception 'Invalid public UX session'
      using errcode = '22023';
  end if;

  if length(v_pathname) not between 1 and 512 or v_pathname not like '/%' then
    raise exception 'Invalid public UX pathname'
      using errcode = '22023';
  end if;

  if v_target is not null and length(v_target) > 512 then
    raise exception 'Invalid public UX target'
      using errcode = '22023';
  end if;

  if jsonb_typeof(v_metadata) <> 'object' or octet_length(v_metadata::text) > 4096 then
    raise exception 'Invalid public UX metadata'
      using errcode = '22023';
  end if;

  -- Store only a deliberately small analytics vocabulary. Raw search text,
  -- form contents, messages, vote contents and integrity material cannot be
  -- persisted through this RPC, even if a modified client tries to send them.
  v_metadata := jsonb_strip_nulls(jsonb_build_object(
    'device', case
      when v_metadata ->> 'device' in ('mobile', 'tablet', 'desktop')
        then v_metadata ->> 'device'
      else null
    end,
    'area', left(nullif(v_metadata ->> 'area', ''), 120),
    'group', left(nullif(v_metadata ->> 'group', ''), 120),
    'query_length', case
      when coalesce(v_metadata ->> 'query_length', '') ~ '^[0-9]{1,4}
    session_id,
    user_id,
    event_name,
    pathname,
    target,
    metadata
  )
  values (
    v_session_id,
    auth.uid(),
    v_event_name,
    v_pathname,
    v_target,
    v_metadata
  );
end
$$;

revoke all on function public.record_public_ux_event(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_public_ux_event(text, text, text, text, jsonb)
  to anon, authenticated;

create or replace function public.admin_public_ux_metrics(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_since timestamptz := greatest(
    coalesce(p_since, now() - interval '30 days'),
    now() - interval '180 days'
  );
  v_result jsonb;
begin
  if not public.has_role(v_actor, 'organizer'::public.app_role) then
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
      count(*) filter (where event_name = 'search_opened') as search_opens,
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
      coalesce(target, 'unknown') as target,
      count(*) filter (where event_name = 'task_started') as started,
      count(*) filter (where event_name = 'task_completed') as completed
    from scoped
    where event_name in ('task_started', 'task_completed')
    group by coalesce(target, 'unknown')
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
        select count(*)::int from session_summary where navigation_steps >= 8
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
          'target', target,
          'started', started,
          'completed', completed,
          'completionRate',
          case when started > 0 then round((completed::numeric / started::numeric) * 100, 1) else 0 end
        )
        order by started desc, target
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
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

revoke all on function public.admin_public_ux_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_ux_metrics(timestamptz)
  to authenticated;

comment on table public.public_ux_events is
  'Privacy-minimised public UX telemetry. Never store vote contents, integrity evidence, personal messages, form contents, raw search queries or client IP addresses here.';

notify pgrst, 'reload schema';

commit;

        then least((v_metadata ->> 'query_length')::int, 500)
      else null
    end,
    'result_count', case
      when coalesce(v_metadata ->> 'result_count', '') ~ '^[0-9]{1,6}
    session_id,
    user_id,
    event_name,
    pathname,
    target,
    metadata
  )
  values (
    v_session_id,
    auth.uid(),
    v_event_name,
    v_pathname,
    v_target,
    v_metadata
  );
end
$$;

revoke all on function public.record_public_ux_event(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_public_ux_event(text, text, text, text, jsonb)
  to anon, authenticated;

create or replace function public.admin_public_ux_metrics(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_since timestamptz := greatest(
    coalesce(p_since, now() - interval '30 days'),
    now() - interval '180 days'
  );
  v_result jsonb;
begin
  if not public.has_role(v_actor, 'organizer'::public.app_role) then
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
      count(*) filter (where event_name = 'search_opened') as search_opens,
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
      coalesce(target, 'unknown') as target,
      count(*) filter (where event_name = 'task_started') as started,
      count(*) filter (where event_name = 'task_completed') as completed
    from scoped
    where event_name in ('task_started', 'task_completed')
    group by coalesce(target, 'unknown')
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
              when coalesce((metadata ->> 'query_length')::int, 0) <= 3 then '1-3'
              when coalesce((metadata ->> 'query_length')::int, 0) <= 8 then '4-8'
              when coalesce((metadata ->> 'query_length')::int, 0) <= 20 then '9-20'
              else '21+'
            end as bucket,
            count(*)::int as count
          from scoped
          where event_name = 'search_submitted'
          group by 1
          order by min(coalesce((metadata ->> 'query_length')::int, 0))
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
        select count(*)::int from session_summary where navigation_steps >= 8
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
          'target', target,
          'started', started,
          'completed', completed,
          'completionRate',
          case when started > 0 then round((completed::numeric / started::numeric) * 100, 1) else 0 end
        )
        order by started desc, target
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
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

revoke all on function public.admin_public_ux_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_ux_metrics(timestamptz)
  to authenticated;

comment on table public.public_ux_events is
  'Privacy-minimised public UX telemetry. Never store vote contents, integrity evidence, personal messages, form contents, raw search queries or client IP addresses here.';

notify pgrst, 'reload schema';

commit;

        then least((v_metadata ->> 'result_count')::int, 10000)
      else null
    end,
    'source', left(nullif(v_metadata ->> 'source', ''), 120),
    'visibility', left(nullif(v_metadata ->> 'visibility', ''), 120),
    'task_status', left(nullif(v_metadata ->> 'task_status', ''), 120),
    'interaction', left(nullif(v_metadata ->> 'interaction', ''), 120),
    'beta_task', left(nullif(v_metadata ->> 'beta_task', ''), 120)
  ));

  insert into public.public_ux_events (
    session_id,
    user_id,
    event_name,
    pathname,
    target,
    metadata
  )
  values (
    v_session_id,
    auth.uid(),
    v_event_name,
    v_pathname,
    v_target,
    v_metadata
  );
end
$$;

revoke all on function public.record_public_ux_event(text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_public_ux_event(text, text, text, text, jsonb)
  to anon, authenticated;

create or replace function public.admin_public_ux_metrics(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_since timestamptz := greatest(
    coalesce(p_since, now() - interval '30 days'),
    now() - interval '180 days'
  );
  v_result jsonb;
begin
  if not public.has_role(v_actor, 'organizer'::public.app_role) then
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
      count(*) filter (where event_name = 'search_opened') as search_opens,
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
      coalesce(target, 'unknown') as target,
      count(*) filter (where event_name = 'task_started') as started,
      count(*) filter (where event_name = 'task_completed') as completed
    from scoped
    where event_name in ('task_started', 'task_completed')
    group by coalesce(target, 'unknown')
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
              when coalesce((metadata ->> 'query_length')::int, 0) <= 3 then '1-3'
              when coalesce((metadata ->> 'query_length')::int, 0) <= 8 then '4-8'
              when coalesce((metadata ->> 'query_length')::int, 0) <= 20 then '9-20'
              else '21+'
            end as bucket,
            count(*)::int as count
          from scoped
          where event_name = 'search_submitted'
          group by 1
          order by min(coalesce((metadata ->> 'query_length')::int, 0))
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
        select count(*)::int from session_summary where navigation_steps >= 8
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
          'target', target,
          'started', started,
          'completed', completed,
          'completionRate',
          case when started > 0 then round((completed::numeric / started::numeric) * 100, 1) else 0 end
        )
        order by started desc, target
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
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

revoke all on function public.admin_public_ux_metrics(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_ux_metrics(timestamptz)
  to authenticated;

comment on table public.public_ux_events is
  'Privacy-minimised public UX telemetry. Never store vote contents, integrity evidence, personal messages, form contents, raw search queries or client IP addresses here.';

notify pgrst, 'reload schema';

commit;
