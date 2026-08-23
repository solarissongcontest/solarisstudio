-- Solaris Song Contest 4 historical result import.
--
-- Original public voting consisted of 39 web votes and 21 Instagram votes.
-- That makes the historical combined result effectively 65% web / 35% Instagram.
-- The final has 1,856 whole points: 1,206 web contribution points + 650 Instagram contribution points.
-- Final ranks intentionally preserve the original historical ordering when rounded points tie.

begin;

do $$
declare
  v_edition_id uuid;
  v_show_id uuid;
  v_geming_entity_id uuid;
  v_country_id uuid;
  v_row record;
begin
  select id
    into strict v_edition_id
  from public.editions
  where edition_number = 4;

  select id
    into strict v_show_id
  from public.shows
  where edition_id = v_edition_id
    and lower(btrim(name)) = 'grand final'
  order by created_at
  limit 1;

  -- The show was created with the right name but the wrong show kind. Correct it
  -- so SSC4 counts as a Grand Final in all-time history and records.
  update public.shows
  set
    kind = 'grand-final',
    qualifier_count = null,
    voting_config = coalesce(voting_config, '{}'::jsonb) || jsonb_build_object(
      'juryEnabled', false,
      'televoteEnabled', true,
      'juryPoints', jsonb_build_array(12, 10, 8, 7, 6, 5, 4, 3, 2, 1),
      'televoteMode', 'total',
      'televotePoints', jsonb_build_array(),
      'televoteRounds', jsonb_build_array(
        jsonb_build_object('id', 'web', 'label', 'Web voting', 'weight', 65),
        jsonb_build_object('id', 'instagram', 'label', 'Instagram voting', 'weight', 35)
      ),
      'weighting', jsonb_build_object('jury', 0, 'televote', 100),
      'weightedScoring', false,
      'tieBreak', jsonb_build_array('televote', 'runningOrder'),
      'qualifiers', null,
      'votingOrder', jsonb_build_array(),
      'allowSelfVote', false
    )
  where id = v_show_id;

  -- Geming is not in the global country library, so keep it as the historical
  -- edition-only custom nation the contest-entity model was designed for.
  select id
    into v_geming_entity_id
  from public.contest_entities
  where edition_id = v_edition_id
    and lower(btrim(abbreviation)) = 'gem'
  limit 1;

  if v_geming_entity_id is null then
    insert into public.contest_entities (
      edition_id,
      entity_type,
      country_id,
      display_name,
      abbreviation,
      region
    ) values (
      v_edition_id,
      'custom',
      null,
      'Geming',
      'GEM',
      'Terra Solaris'
    )
    returning id into v_geming_entity_id;
  end if;

  -- This import owns the SSC4 Grand Final result table. Re-running it is safe and
  -- restores the exact historical result rather than duplicating rows.
  delete from public.results where show_id = v_show_id;

  for v_row in
    select *
    from (values
      -- country,        rank, web pts, web votes, web %, instagram pts, instagram votes, instagram %
      ('Intago',          1, 216, 7, 17.95::numeric, 124, 4, 19.05::numeric),
      ('Elaria',          2, 123, 4, 10.26::numeric, 185, 6, 28.57::numeric),
      ('Skandia',         3, 155, 5, 12.82::numeric,  31, 1,  4.76::numeric),
      ('Diaria',          4,  93, 3,  7.69::numeric,  93, 3, 14.29::numeric),
      ('Oland',           5, 155, 5, 12.82::numeric,   0, 0,  0.00::numeric),
      ('Geming',          6,  93, 3,  7.69::numeric,  62, 2,  9.52::numeric),
      ('Surgud',          7, 123, 4, 10.26::numeric,   0, 0,  0.00::numeric),
      ('Bentagya',        8,  93, 3,  7.69::numeric,   0, 0,  0.00::numeric),
      ('Cilestia',        9,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Leigh',          10,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Zarzad',         11,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Aquliateria',    12,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Calgaria',       13,  31, 1,  2.56::numeric,  31, 1,  4.76::numeric),
      ('Edravia',        14,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Titis',          15,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Rharaj',         16,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric)
    ) as imported(
      country_name,
      final_rank,
      web_points,
      web_votes,
      web_percentage,
      instagram_points,
      instagram_votes,
      instagram_percentage
    )
  loop
    v_country_id := null;

    if lower(v_row.country_name) <> 'geming' then
      select id
        into v_country_id
      from public.countries
      where lower(btrim(name)) = lower(v_row.country_name)
      limit 1;

      if v_country_id is null then
        raise exception 'SSC4 import cannot find global country %', v_row.country_name;
      end if;
    end if;

    insert into public.results (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      jury_points,
      televote_points,
      total_points,
      final_rank,
      televote_components,
      updated_at
    ) values (
      v_edition_id,
      v_show_id,
      v_country_id,
      case when lower(v_row.country_name) = 'geming' then v_geming_entity_id else null end,
      0,
      v_row.web_points + v_row.instagram_points,
      v_row.web_points + v_row.instagram_points,
      v_row.final_rank,
      jsonb_build_array(
        jsonb_build_object(
          'round_id', 'web',
          'label', 'Web voting',
          'points', v_row.web_points,
          'raw_votes', v_row.web_votes,
          'percentage', v_row.web_percentage
        ),
        jsonb_build_object(
          'round_id', 'instagram',
          'label', 'Instagram voting',
          'points', v_row.instagram_points,
          'raw_votes', v_row.instagram_votes,
          'percentage', v_row.instagram_percentage
        )
      ),
      now()
    );
  end loop;

  if (select coalesce(sum(televote_points), 0) from public.results where show_id = v_show_id) <> 1856 then
    raise exception 'SSC4 import failed total-points verification';
  end if;

  if (select coalesce(sum((component->>'points')::integer), 0)
      from public.results r
      cross join lateral jsonb_array_elements(r.televote_components) component
      where r.show_id = v_show_id and component->>'round_id' = 'web') <> 1206 then
    raise exception 'SSC4 import failed web-round verification';
  end if;

  if (select coalesce(sum((component->>'points')::integer), 0)
      from public.results r
      cross join lateral jsonb_array_elements(r.televote_components) component
      where r.show_id = v_show_id and component->>'round_id' = 'instagram') <> 650 then
    raise exception 'SSC4 import failed Instagram-round verification';
  end if;
end
$$;

commit;
