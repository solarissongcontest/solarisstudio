-- Ensure existing databases that already ran the original SSC20 reconciliation
-- also refresh the sanitized public snapshot from the repaired archived source.
do $$
declare
  target_round uuid;
  target_show uuid;
begin
  select r.id into strict target_round
  from televoting.rounds r
  join televoting.editions e on e.id = r.edition_id
  where e.name = 'Solaris Song Contest 20'
    and r.name = 'Grand Final';

  select s.id into strict target_show
  from public.shows s
  join public.editions e on e.id = s.edition_id
  where e.edition_number = 20
    and s.kind = 'grand-final';

  update public.public_televote_country_contributions p
  set
    country_contributions = rr.calculation_config -> 'country_contributions',
    final_points = tv.points,
    updated_at = now()
  from televoting.round_results rr
  join public.countries c
    on c.short_code = rr.country_code
  join public.televote_votes tv
    on tv.show_id = target_show
   and tv.country_id = c.id
  where p.show_id = target_show
    and p.round_id = target_round::text
    and rr.round_id = target_round
    and rr.country_code = p.country_code
    and jsonb_typeof(rr.calculation_config -> 'country_contributions') = 'object';

  if exists (
    select 1
    from televoting.round_results rr
    join public.public_televote_country_contributions p
      on p.show_id = target_show
     and p.round_id = target_round::text
     and p.country_code = rr.country_code
    where rr.round_id = target_round
      and rr.calculation_config -> 'country_contributions'
          is distinct from p.country_contributions
  ) then
    raise exception 'SSC20 public country-source snapshot remains stale';
  end if;
end $$;
