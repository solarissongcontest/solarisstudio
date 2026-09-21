-- Repair the country-source breakdown in the archived SSC20 round from the
-- organizer PDF observations. The official converted points remain untouched.
do $$
declare
  target_round uuid;
  expected_source constant text := 'ssc20_grand_final_country_detailed_pdf_2026_09_09';
begin
  select r.id into strict target_round
  from televoting.rounds r
  join televoting.editions e on e.id = r.edition_id
  where e.name = 'Solaris Song Contest 20' and r.name = 'Grand Final';

  if (select count(*) from televoting.round_results where round_id = target_round) <> 26
     or (select count(*) from televoting.historical_vote_observations where source_key = expected_source) <> 627
     or (select count(*) from televoting.historical_vote_observations where source_key = expected_source and score > 0) <> 219
     or exists (
       select 1 from televoting.round_results rr
       where rr.round_id = target_round
         and rr.original_votes <> coalesce((rr.calculation_config->>'activity_points')::integer, 0)
           + (select coalesce(sum(h.score), 0) from televoting.historical_vote_observations h
              where h.source_key = expected_source and h.target_country_code = rr.country_code)
     ) then
    raise exception 'SSC20 PDF observations do not reconcile with archived round raw totals';
  end if;

  update televoting.round_results rr
  set calculation_config = jsonb_set(
    coalesce(rr.calculation_config, '{}'::jsonb),
    '{country_contributions}',
    coalesce((
      select jsonb_object_agg(h.voter_country_code, h.score)
      from televoting.historical_vote_observations h
      where h.source_key = expected_source
        and h.target_country_code = rr.country_code
        and h.score > 0
    ), '{}'::jsonb), true
  )
  where rr.round_id = target_round;
end $$;
