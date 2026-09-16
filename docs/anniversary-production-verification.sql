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
  select distinct p.edition_id, p.country_id
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
    and coalesce(s.publication_config ->> 'results', 'private') = 'public'
    and exists (
      select 1 from public.results r
      where r.show_id = s.id and coalesce(r.total_points, 0) <> 0
    )
)
select
  (select count(*) from anniversary_editions) as chapters,
  (select count(*) from anniversary_shows) as public_shows,
  (select count(*) from anniversary_participations) as entries,
  (select count(distinct country_id) from anniversary_participations) as countries,
  (select count(*) from resolved_finals) as resolved_finals;
