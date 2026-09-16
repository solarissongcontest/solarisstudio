-- Read-only launch verification for the 17 September 2026 anniversary.
-- This intentionally derives values from canonical production data instead of
-- hard-coding them into application tests.
with anniversary_editions as (
  select id, edition_number, event_date
  from public.editions
  where published
    and event_date >= date '2025-09-17'
    and event_date < date '2026-09-17'
),
anniversary_participations as (
  -- One canonical entry per edition/identity. Custom contest entities are
  -- entries too, even though they are not countries in the country headline.
  select distinct
    p.edition_id,
    coalesce(p.country_id::text, p.contest_entity_id::text) as identity_id
  from public.participants p
  join anniversary_editions e on e.id = p.edition_id
  where coalesce(p.country_id::text, p.contest_entity_id::text) is not null
),
anniversary_countries as (
  select distinct p.country_id
  from public.participants p
  join anniversary_editions e on e.id = p.edition_id
  where p.country_id is not null
),
anniversary_shows as (
  select s.*
  from public.shows s
  join anniversary_editions e on e.id = s.edition_id
  where s.published
),
resolved_finals as (
  select s.id as show_id, s.edition_id
  from anniversary_shows s
  where s.kind in ('grand-final', 'final')
    -- Legacy published shows predate publication_config and imply the Results
    -- preset. Modern rows expose the explicit results boolean.
    and coalesce((s.publication_config ->> 'results')::boolean, true)
    and exists (
      select 1 from public.results r
      where r.show_id = s.id
        and r.final_rank = 1
    )
    and exists (
      select 1 from public.results r
      where r.show_id = s.id
        and (
          coalesce(r.total_points, 0) <> 0
          or coalesce(r.jury_points, 0) <> 0
          or coalesce(r.televote_points, 0) <> 0
        )
    )
)
select
  (select count(*) from anniversary_editions) as chapters,
  (select count(*) from anniversary_shows) as public_shows,
  (select count(*) from anniversary_participations) as entries,
  (select count(*) from anniversary_countries) as countries,
  (select count(*) from resolved_finals) as resolved_finals;
