begin;

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
      'search_used'
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
  );

create index if not exists public_ux_events_task_run_created_idx
  on public.public_ux_events ((metadata ->> 'task_run'), created_at)
  where metadata ? 'task_run';

create or replace function public.admin_beta3_first_click_evidence(
  p_since timestamptz default now() - interval '90 days'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_since timestamptz := greatest(
    coalesce(p_since, now() - interval '90 days'),
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
      and metadata ? 'beta_task'
      and metadata ? 'task_run'
  ),
  task_runs as (
    select distinct on (metadata ->> 'task_run')
      metadata ->> 'task_run' as run_id,
      metadata ->> 'beta_task' as task
    from scoped
    where event_name = 'task_started'
    order by metadata ->> 'task_run', created_at, id
  ),
  first_clicks as (
    select distinct on (metadata ->> 'task_run')
      metadata ->> 'task_run' as run_id,
      metadata ->> 'beta_task' as task,
      target
    from scoped
    where event_name in (
      'public_nav_clicked',
      'section_nav_clicked',
      'search_result_clicked',
      'breadcrumb_clicked',
      'hub_primary_clicked'
    )
      and target is not null
    order by metadata ->> 'task_run', created_at, id
  ),
  run_counts as (
    select task, count(*)::int as started
    from task_runs
    group by task
  ),
  click_counts as (
    select task, target, count(*)::int as count
    from first_clicks
    group by task, target
  )
  select jsonb_build_object(
    'since', v_since,
    'runs', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'task', task,
          'started', started
        )
        order by task
      )
      from run_counts
    ), '[]'::jsonb),
    'firstClicks', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'task', task,
          'target', target,
          'count', count
        )
        order by task, count desc, target
      )
      from click_counts
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

revoke all on function public.admin_beta3_first_click_evidence(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_beta3_first_click_evidence(timestamptz)
  to authenticated;

comment on function public.admin_beta3_first_click_evidence(timestamptz) is
  'Organizer-only aggregate of Beta 3 task runs and first destination clicks. Returns no user identifiers, search text, form contents, votes, messages or integrity evidence.';

notify pgrst, 'reload schema';

commit;
