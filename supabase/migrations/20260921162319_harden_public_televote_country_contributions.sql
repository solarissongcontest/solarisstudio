drop view if exists public.public_televote_country_contributions;

create table if not exists public.public_televote_country_contributions (
  show_id uuid not null references public.shows(id) on delete cascade,
  round_id text not null,
  round_name text not null,
  country_code text not null,
  final_points integer not null default 0,
  activity_points numeric null,
  country_contributions jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (show_id, round_id, country_code),
  constraint public_televote_country_contributions_object_check
    check (jsonb_typeof(country_contributions) = 'object')
);

alter table public.public_televote_country_contributions enable row level security;

revoke all on public.public_televote_country_contributions from public;
grant select on public.public_televote_country_contributions to anon, authenticated;

drop policy if exists "published detailed televote read" on public.public_televote_country_contributions;
create policy "published detailed televote read"
on public.public_televote_country_contributions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.shows s
    where s.id = show_id
      and s.published is true
      and coalesce((s.publication_config ->> 'detailed_voting')::boolean, false)
      and coalesce((s.publication_config ->> 'televote_results')::boolean, false)
  )
);

insert into public.public_televote_country_contributions (
  show_id,
  round_id,
  round_name,
  country_code,
  final_points,
  activity_points,
  country_contributions,
  updated_at
)
select
  b.show_id,
  r.id::text,
  r.name,
  rr.country_code,
  rr.final_points,
  case
    when coalesce(rr.calculation_config ->> 'activity_points', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (rr.calculation_config ->> 'activity_points')::numeric
    else null
  end,
  rr.calculation_config -> 'country_contributions',
  now()
from public.televoting_round_bindings b
join public.shows s on s.id = b.show_id
join televoting.rounds r on r.id::text = b.remote_round_id
join televoting.round_results rr on rr.round_id = r.id
where b.show_id is not null
  and s.published is true
  and coalesce((s.publication_config ->> 'detailed_voting')::boolean, false)
  and coalesce((s.publication_config ->> 'televote_results')::boolean, false)
  and r.public_advanced_transparency is true
  and r.results_status in ('locked', 'published')
  and jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object'
  and rr.calculation_config -> 'country_contributions' <> '{}'::jsonb
on conflict (show_id, round_id, country_code) do update
set
  round_name = excluded.round_name,
  final_points = excluded.final_points,
  activity_points = excluded.activity_points,
  country_contributions = excluded.country_contributions,
  updated_at = excluded.updated_at;

comment on table public.public_televote_country_contributions is
'Sanitized public snapshot of aggregate country-source televote contributions. Contains no raw ballots, usernames, integrity data, or internal calculation config.';
