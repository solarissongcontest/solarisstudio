create or replace view public.public_televote_country_contributions
with (security_barrier = true)
as
select
  b.show_id,
  r.id::text as round_id,
  r.name as round_name,
  rr.country_code,
  rr.final_points,
  case
    when jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object'
      then rr.calculation_config -> 'country_contributions'
    else '{}'::jsonb
  end as country_contributions,
  case
    when coalesce(rr.calculation_config ->> 'activity_points', '') ~ '^[0-9]+([.][0-9]+)?$'
      then (rr.calculation_config ->> 'activity_points')::numeric
    else null
  end as activity_points
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
  and rr.calculation_config -> 'country_contributions' <> '{}'::jsonb;

revoke all on public.public_televote_country_contributions from public;
grant select on public.public_televote_country_contributions to anon, authenticated;

comment on view public.public_televote_country_contributions is
'Sanitized public country-source televote aggregates. Exposes only canonically published show detail with advanced transparency; never raw ballots, usernames, integrity data, or internal calculation metadata.';
