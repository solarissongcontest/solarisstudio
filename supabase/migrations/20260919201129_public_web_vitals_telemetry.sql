begin;

create table if not exists public.public_web_vitals (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null,
  pathname text not null,
  metric_name text not null,
  value double precision not null,
  rating text not null,
  device text not null,
  viewport_width integer not null,
  viewport_height integer not null,
  navigation_type text not null default 'unknown',
  constraint public_web_vitals_session_id_check check (
    length(session_id) between 8 and 128
  ),
  constraint public_web_vitals_pathname_check check (
    length(pathname) between 1 and 512 and pathname like '/%'
  ),
  constraint public_web_vitals_metric_check check (
    metric_name in ('LCP', 'INP', 'CLS')
  ),
  constraint public_web_vitals_value_check check (
    value >= 0 and value <= 600000
  ),
  constraint public_web_vitals_rating_check check (
    rating in ('good', 'needs-improvement', 'poor')
  ),
  constraint public_web_vitals_device_check check (
    device in ('mobile', 'tablet', 'desktop')
  ),
  constraint public_web_vitals_viewport_check check (
    viewport_width between 1 and 10000
    and viewport_height between 1 and 10000
  ),
  constraint public_web_vitals_navigation_check check (
    navigation_type in ('navigate', 'reload', 'back_forward', 'prerender', 'unknown')
  )
);

alter table public.public_web_vitals enable row level security;

revoke all on table public.public_web_vitals from public, anon, authenticated;
grant insert on table public.public_web_vitals to anon, authenticated;
grant select on table public.public_web_vitals to authenticated;
grant all on table public.public_web_vitals to service_role;

drop policy if exists "Public web vitals can be recorded" on public.public_web_vitals;
create policy "Public web vitals can be recorded"
on public.public_web_vitals
for insert
to anon, authenticated
with check (
  length(session_id) between 8 and 128
  and pathname like '/%'
  and metric_name in ('LCP', 'INP', 'CLS')
);

drop policy if exists "Organizers can read public web vitals" on public.public_web_vitals;
create policy "Organizers can read public web vitals"
on public.public_web_vitals
for select
to authenticated
using (
  public.studio2_access_allowed('rollout.manage', null, false)
);

create index if not exists public_web_vitals_created_at_idx
  on public.public_web_vitals (created_at desc);

create index if not exists public_web_vitals_metric_created_idx
  on public.public_web_vitals (metric_name, created_at desc);

create index if not exists public_web_vitals_path_metric_created_idx
  on public.public_web_vitals (pathname, metric_name, created_at desc);

create or replace function public.admin_public_web_vitals(
  p_since timestamptz default now() - interval '30 days'
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
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
    from public.public_web_vitals
    where created_at >= v_since
  ),
  grouped as (
    select
      pathname,
      metric_name,
      device,
      count(*)::int as samples,
      percentile_cont(0.75) within group (order by value) as p75,
      count(*) filter (where rating = 'good')::int as good,
      count(*) filter (where rating = 'needs-improvement')::int as needs_improvement,
      count(*) filter (where rating = 'poor')::int as poor
    from scoped
    group by pathname, metric_name, device
  )
  select jsonb_build_object(
    'since', v_since,
    'generatedAt', now(),
    'samples', (select count(*)::int from scoped),
    'routes', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'pathname', pathname,
          'metric', metric_name,
          'device', device,
          'samples', samples,
          'p75', round(p75::numeric, 3),
          'good', good,
          'needsImprovement', needs_improvement,
          'poor', poor
        )
        order by pathname, metric_name, device
      )
      from grouped
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end
$$;

revoke all on function public.admin_public_web_vitals(timestamptz)
  from public, anon, authenticated;
grant execute on function public.admin_public_web_vitals(timestamptz)
  to authenticated;

comment on table public.public_web_vitals is
  'Privacy-minimised field Core Web Vitals telemetry for public Solaris Studio routes.';

commit;
