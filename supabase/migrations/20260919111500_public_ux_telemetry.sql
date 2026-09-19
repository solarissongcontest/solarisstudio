begin;

create table if not exists public.public_ux_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  user_id uuid default auth.uid() references auth.users(id) on delete set null,
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
  ),
  constraint public_ux_events_metadata_keys_check check (
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
      'elapsed_ms',
      'start_route',
      'search_used'
    ] = '{}'::jsonb
  ),
  constraint public_ux_events_metadata_device_check check (
    not (metadata ? 'device')
    or metadata ->> 'device' in ('mobile', 'tablet', 'desktop')
  ),
  constraint public_ux_events_metadata_query_length_check check (
    not (metadata ? 'query_length')
    or (
      metadata ->> 'query_length' ~ '^[0-9]{1,4}$'
      and (metadata ->> 'query_length')::int between 0 and 500
    )
  ),
  constraint public_ux_events_metadata_result_count_check check (
    not (metadata ? 'result_count')
    or (
      metadata ->> 'result_count' ~ '^[0-9]{1,6}$'
      and (metadata ->> 'result_count')::int between 0 and 10000
    )
  ),
  constraint public_ux_events_metadata_elapsed_check check (
    not (metadata ? 'elapsed_ms')
    or (
      metadata ->> 'elapsed_ms' ~ '^[0-9]{1,8}$'
      and (metadata ->> 'elapsed_ms')::int between 0 and 86400000
    )
  ),
  constraint public_ux_events_metadata_search_used_check check (
    not (metadata ? 'search_used')
    or metadata ->> 'search_used' in ('yes', 'no')
  ),
  constraint public_ux_events_metadata_start_route_check check (
    not (metadata ? 'start_route')
    or (
      length(metadata ->> 'start_route') between 1 and 120
      and metadata ->> 'start_route' like '/%'
    )
  ),
  constraint public_ux_events_metadata_text_lengths_check check (
    coalesce(length(metadata ->> 'area'), 0) <= 120
    and coalesce(length(metadata ->> 'group'), 0) <= 120
    and coalesce(length(metadata ->> 'source'), 0) <= 120
    and coalesce(length(metadata ->> 'visibility'), 0) <= 120
    and coalesce(length(metadata ->> 'task_status'), 0) <= 120
    and coalesce(length(metadata ->> 'interaction'), 0) <= 120
    and coalesce(length(metadata ->> 'beta_task'), 0) <= 120
  )
);

alter table public.public_ux_events enable row level security;

revoke all on table public.public_ux_events from public, anon, authenticated;
grant insert on table public.public_ux_events to anon, authenticated;
grant select on table public.public_ux_events to authenticated;
grant all on table public.public_ux_events to service_role;

drop policy if exists "Public UX events can be recorded" on public.public_ux_events;
create policy "Public UX events can be recorded"
on public.public_ux_events
for insert
to anon, authenticated
with check (
  user_id is not distinct from (select auth.uid())
);

drop policy if exists "Organizers can read public UX events" on public.public_ux_events;
create policy "Organizers can read public UX events"
on public.public_ux_events
for select
to authenticated
using (
  public.has_role((select auth.uid()), 'organizer'::public.app_role)
);

create index if not exists public_ux_events_created_at_idx
  on public.public_ux_events (created_at desc);

create index if not exists public_ux_events_event_created_idx
  on public.public_ux_events (event_name, created_at desc);

create index if not exists public_ux_events_session_created_idx
  on public.public_ux_events (session_id, created_at);

create or replace function public.admin_public_ux_metrics(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security invoker
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
