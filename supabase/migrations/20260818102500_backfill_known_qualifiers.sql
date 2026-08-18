-- Correct qualification metadata only when the archive itself proves that a
-- country reached the Grand Final in the same edition. This does not modify
-- results, placements, jury points, televote points, or total points.

with final_presence as (
  select distinct p.edition_id, p.country_id
  from public.participants p
  join public.shows s on s.id = p.show_id
  where s.kind = 'grand-final'

  union

  select distinct r.edition_id, r.country_id
  from public.results r
  join public.shows s on s.id = r.show_id
  where s.kind = 'grand-final'
)
update public.participants as semi
set qualified = true
from public.shows as semi_show,
     final_presence as final
where semi.show_id = semi_show.id
  and semi_show.kind = 'semi-final'
  and final.edition_id = semi.edition_id
  and final.country_id = semi.country_id
  and semi.qualified is distinct from true;
