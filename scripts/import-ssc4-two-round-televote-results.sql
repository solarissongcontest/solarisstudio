-- Solaris Song Contest 4 historical result import.
--
-- Original public voting consisted of 39 web votes and 21 Instagram votes.
-- That makes the historical combined result effectively 65% web / 35% Instagram.
-- The final has 1,856 whole points: 1,206 web contribution points + 650 Instagram contribution points.
-- Final ranks intentionally preserve the original historical ordering when rounded points tie.
--
-- This import also owns the SSC4 Grand Final line-up and aggregate televote totals,
-- so the organizer Entries and Televote totals workspaces show the historical data.

begin;

do $$
declare
  v_edition_id uuid;
  v_show_id uuid;
  v_country_id uuid;
  v_entity_id uuid;
  v_tal_country_id uuid;
  v_geming_entity_id uuid;
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

  select id
    into strict v_tal_country_id
  from public.countries
  where lower(btrim(name)) = 'tal di fjeme';

  -- The show was created with the right name but the wrong show kind. Keep the
  -- corrected Grand Final identity and the historical two-round public vote.
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

  -- The earlier draft import treated Geming as an edition-only custom entity.
  -- Geming was actually Tal Di Fjeme, which already exists in the global country
  -- library. Reuse the old entity row when possible so no dangling identity is left.
  select id
    into v_entity_id
  from public.contest_entities
  where edition_id = v_edition_id
    and country_id = v_tal_country_id
  limit 1;

  if v_entity_id is null then
    select id
      into v_geming_entity_id
    from public.contest_entities
    where edition_id = v_edition_id
      and entity_type = 'custom'
      and lower(btrim(display_name)) = 'geming'
    limit 1;

    if v_geming_entity_id is not null then
      update public.contest_entities ce
      set
        entity_type = 'global',
        country_id = c.id,
        display_name = c.name,
        abbreviation = c.short_code,
        flag_image = c.flag_image,
        region = c.region
      from public.countries c
      where ce.id = v_geming_entity_id
        and c.id = v_tal_country_id
      returning ce.id into v_entity_id;
    else
      insert into public.contest_entities (
        edition_id,
        entity_type,
        country_id,
        display_name,
        abbreviation,
        flag_image,
        region
      )
      select
        v_edition_id,
        'global',
        c.id,
        c.name,
        c.short_code,
        c.flag_image,
        c.region
      from public.countries c
      where c.id = v_tal_country_id
      returning id into v_entity_id;
    end if;
  end if;

  -- Clear the old result/vote materialisation first. Participant and vote triggers
  -- may rebuild temporary standings while the import runs; the exact historical
  -- ranks and round breakdown are restored after the complete line-up is present.
  delete from public.results where show_id = v_show_id;
  delete from public.televote_votes where show_id = v_show_id;

  for v_row in
    select *
    from (values
      -- country,          rank, web pts, web votes, web %, instagram pts, instagram votes, instagram %
      ('Intago',            1, 216, 7, 17.95::numeric, 124, 4, 19.05::numeric),
      ('Elaria',            2, 123, 4, 10.26::numeric, 185, 6, 28.57::numeric),
      ('Skandia',           3, 155, 5, 12.82::numeric,  31, 1,  4.76::numeric),
      ('Diaria',            4,  93, 3,  7.69::numeric,  93, 3, 14.29::numeric),
      ('Oland',             5, 155, 5, 12.82::numeric,   0, 0,  0.00::numeric),
      ('Tal Di Fjeme',      6,  93, 3,  7.69::numeric,  62, 2,  9.52::numeric),
      ('Surgud',            7, 123, 4, 10.26::numeric,   0, 0,  0.00::numeric),
      ('Bentagya',          8,  93, 3,  7.69::numeric,   0, 0,  0.00::numeric),
      ('Cilestia',          9,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Leigh',            10,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Zarzad',           11,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Aquliateria',      12,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Calgaria',         13,  31, 1,  2.56::numeric,  31, 1,  4.76::numeric),
      ('Edravia',          14,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Titis',            15,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Rharaj',           16,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric)
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
    select id
      into v_country_id
    from public.countries
    where lower(btrim(name)) = lower(v_row.country_name)
    limit 1;

    if v_country_id is null then
      raise exception 'SSC4 import cannot find global country %', v_row.country_name;
    end if;

    select id
      into v_entity_id
    from public.contest_entities
    where edition_id = v_edition_id
      and country_id = v_country_id
    limit 1;

    if v_entity_id is null then
      insert into public.contest_entities (
        edition_id,
        entity_type,
        country_id,
        display_name,
        abbreviation,
        flag_image,
        region
      )
      select
        v_edition_id,
        'global',
        c.id,
        c.name,
        c.short_code,
        c.flag_image,
        c.region
      from public.countries c
      where c.id = v_country_id
      returning id into v_entity_id;
    end if;

    -- Running order is intentionally left unknown rather than fabricating one
    -- from the result ranking. The line-up still appears correctly in organizer
    -- tools and can be completed later if the historical running order is found.
    insert into public.participants (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      running_order,
      semi_final,
      qualified,
      participation_status,
      updated_at
    ) values (
      v_edition_id,
      v_show_id,
      v_country_id,
      v_entity_id,
      null,
      'grand-final',
      null,
      'confirmed',
      now()
    )
    on conflict (show_id, country_id) where show_id is not null
    do update set
      contest_entity_id = excluded.contest_entity_id,
      semi_final = 'grand-final',
      participation_status = 'confirmed',
      updated_at = now();

    -- One aggregate row feeds the normal Solaris result engine. The original
    -- Web/Instagram split remains separately preserved on results below.
    insert into public.televote_votes (
      edition_id,
      show_id,
      country_id,
      contest_entity_id,
      points
    ) values (
      v_edition_id,
      v_show_id,
      v_country_id,
      v_entity_id,
      v_row.web_points + v_row.instagram_points
    );
  end loop;

  -- Remove any stale line-up row from an earlier partial SSC4 import.
  delete from public.participants p
  where p.show_id = v_show_id
    and not exists (
      select 1
      from public.televote_votes t
      where t.show_id = v_show_id
        and coalesce(t.country_id, t.contest_entity_id) = coalesce(p.country_id, p.contest_entity_id)
    );

  -- Rebuild the exact historical result after all participant/vote triggers have
  -- finished their intermediate recalculations.
  delete from public.results where show_id = v_show_id;

  for v_row in
    select *
    from (values
      ('Intago',            1, 216, 7, 17.95::numeric, 124, 4, 19.05::numeric),
      ('Elaria',            2, 123, 4, 10.26::numeric, 185, 6, 28.57::numeric),
      ('Skandia',           3, 155, 5, 12.82::numeric,  31, 1,  4.76::numeric),
      ('Diaria',            4,  93, 3,  7.69::numeric,  93, 3, 14.29::numeric),
      ('Oland',             5, 155, 5, 12.82::numeric,   0, 0,  0.00::numeric),
      ('Tal Di Fjeme',      6,  93, 3,  7.69::numeric,  62, 2,  9.52::numeric),
      ('Surgud',            7, 123, 4, 10.26::numeric,   0, 0,  0.00::numeric),
      ('Bentagya',          8,  93, 3,  7.69::numeric,   0, 0,  0.00::numeric),
      ('Cilestia',          9,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Leigh',            10,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Zarzad',           11,   0, 0,  0.00::numeric,  62, 2,  9.52::numeric),
      ('Aquliateria',      12,  62, 2,  5.13::numeric,   0, 0,  0.00::numeric),
      ('Calgaria',         13,  31, 1,  2.56::numeric,  31, 1,  4.76::numeric),
      ('Edravia',          14,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Titis',            15,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric),
      ('Rharaj',           16,   0, 0,  0.00::numeric,   0, 0,  0.00::numeric)
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
    select c.id, ce.id
      into strict v_country_id, v_entity_id
    from public.countries c
    join public.contest_entities ce
      on ce.edition_id = v_edition_id
     and ce.country_id = c.id
    where lower(btrim(c.name)) = lower(v_row.country_name)
    limit 1;

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
      v_entity_id,
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

  -- Run the normal result engine once more. Its unresolved-tie fallback now keeps
  -- the already-known historical final rank instead of falling back to UUID order.
  perform public.sync_show_results_from_votes(v_show_id);

  if (select count(*) from public.participants where show_id = v_show_id) <> 16 then
    raise exception 'SSC4 import failed participant-count verification';
  end if;

  if (select count(*) from public.televote_votes where show_id = v_show_id) <> 16 then
    raise exception 'SSC4 import failed aggregate-televote-count verification';
  end if;

  if (select count(*) from public.results where show_id = v_show_id) <> 16 then
    raise exception 'SSC4 import failed result-count verification';
  end if;

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

  if not exists (
    select 1
    from public.results r
    join public.countries c on c.id = r.country_id
    where r.show_id = v_show_id
      and c.id = v_tal_country_id
      and r.final_rank = 6
      and r.total_points = 155
  ) then
    raise exception 'SSC4 import failed Tal Di Fjeme replacement verification';
  end if;

  if exists (
    select 1
    from public.contest_entities ce
    where ce.edition_id = v_edition_id
      and lower(btrim(ce.display_name)) = 'geming'
  ) then
    raise exception 'SSC4 import still contains the obsolete Geming identity';
  end if;
end
$$;

commit;
