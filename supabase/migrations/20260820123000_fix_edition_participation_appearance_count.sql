begin;

-- The canonical show_id = null row represents the edition participation itself,
-- not an appearance in a semi-final/final. Keep the view's count aligned with
-- show_ids so one real show appearance is counted exactly once.
create or replace view public.edition_participations
with (security_invoker = true)
as
with grouped as (
  select
    p.edition_id,
    case
      when p.country_id is not null then 'country:' || p.country_id::text
      else 'entity:' || p.contest_entity_id::text
    end as identity_key,
    max(p.country_id::text)::uuid as country_id,
    max(p.contest_entity_id::text)::uuid as contest_entity_id,
    (array_agg(p.artist order by (p.artist is not null) desc, p.updated_at desc, p.created_at desc) filter (where p.artist is not null))[1] as artist,
    (array_agg(p.song order by (p.song is not null) desc, p.updated_at desc, p.created_at desc) filter (where p.song is not null))[1] as song,
    bool_or(coalesce(p.qualified, false)) as qualified,
    (count(*) filter (where p.show_id is not null))::integer as show_appearance_count,
    array_agg(p.show_id order by p.created_at, p.id) filter (where p.show_id is not null) as show_ids,
    min(p.created_at) as created_at,
    max(p.updated_at) as updated_at
  from public.participants p
  group by p.edition_id,
    case
      when p.country_id is not null then 'country:' || p.country_id::text
      else 'entity:' || p.contest_entity_id::text
    end
)
select * from grouped;

grant select on public.edition_participations to anon, authenticated;
notify pgrst, 'reload schema';

commit;
