begin;

-- Anniversary country debuts must work for legacy editions that predate the
-- canonical show_id-null participant row. Deduplicate by country/edition via
-- MIN(event_date) instead of requiring one particular participant row shape.
create or replace function public.studio2_anniversary_engine(
  p_reference_date date default current_date,
  p_limit integer default 24
)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_reference date := coalesce(p_reference_date, current_date);
  v_limit integer := greatest(1, least(coalesce(p_limit, 24), 100));
  v_on_this_day jsonb := '[]'::jsonb;
  v_one_year jsonb := '[]'::jsonb;
  v_five_year jsonb := '[]'::jsonb;
  v_country_anniversaries jsonb := '[]'::jsonb;
  v_recent_stories jsonb := '[]'::jsonb;
  v_ssc_anniversary jsonb := null;
begin
  select coalesce(jsonb_agg(moment order by occurred_at desc), '[]'::jsonb)
  into v_on_this_day
  from (
    select i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', extract(year from v_reference)::integer - extract(year from (i.occurred_at at time zone 'Europe/Paris'))::integer
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and to_char(i.occurred_at at time zone 'Europe/Paris', 'MM-DD') = to_char(v_reference, 'MM-DD')
      and (i.occurred_at at time zone 'Europe/Paris')::date < v_reference
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  select coalesce(jsonb_agg(moment order by importance desc, occurred_at desc), '[]'::jsonb)
  into v_one_year
  from (
    select i.importance, i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', 1
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and (i.occurred_at at time zone 'Europe/Paris')::date = (v_reference - interval '1 year')::date
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  select coalesce(jsonb_agg(moment order by importance desc, occurred_at desc), '[]'::jsonb)
  into v_five_year
  from (
    select i.importance, i.occurred_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'headline', i.headline,
        'summary', i.summary,
        'importance', i.importance,
        'occurredAt', i.occurred_at,
        'yearsAgo', 5
      ) moment
    from public.studio2_storyline_items i
    join public.studio2_storylines s on s.id = i.storyline_id and s.status = 'published'
    join public.editions e on e.id = s.edition_id and e.published
    where i.included
      and (i.occurred_at at time zone 'Europe/Paris')::date = (v_reference - interval '5 years')::date
    order by i.importance desc, i.occurred_at desc
    limit v_limit
  ) q;

  with first_participations as (
    select p.country_id, min(e.event_date) as first_date
    from public.participants p
    join public.editions e on e.id = p.edition_id
    where p.country_id is not null
      and e.published
      and e.event_date is not null
    group by p.country_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'countryId', c.id,
    'countryName', c.name,
    'firstParticipationDate', f.first_date,
    'years', extract(year from age(v_reference, f.first_date))::integer
  ) order by c.name), '[]'::jsonb)
  into v_country_anniversaries
  from first_participations f
  join public.countries c on c.id = f.country_id
  where f.first_date < v_reference
    and to_char(f.first_date, 'MM-DD') = to_char(v_reference, 'MM-DD');

  if v_reference >= date '2022-09-17' and to_char(v_reference, 'MM-DD') = '09-17' then
    v_ssc_anniversary := jsonb_build_object(
      'birthDate', '2022-09-17',
      'years', extract(year from v_reference)::integer - 2022,
      'label', format('%s years of Solaris', extract(year from v_reference)::integer - 2022)
    );
  end if;

  select coalesce(jsonb_agg(story order by published_at desc), '[]'::jsonb)
  into v_recent_stories
  from (
    select s.published_at,
      jsonb_build_object(
        'editionSlug', e.slug,
        'editionName', e.name,
        'editionNumber', e.edition_number,
        'title', s.title,
        'subtitle', s.subtitle,
        'publishedAt', s.published_at,
        'itemCount', (select count(*) from public.studio2_storyline_items i where i.storyline_id = s.id and i.included)
      ) story
    from public.studio2_storylines s
    join public.editions e on e.id = s.edition_id
    where s.status = 'published' and e.published
    order by s.published_at desc
    limit least(v_limit, 12)
  ) q;

  return jsonb_build_object(
    'referenceDate', v_reference,
    'timeZone', 'Europe/Paris',
    'sscAnniversary', v_ssc_anniversary,
    'onThisDay', v_on_this_day,
    'oneYearAgo', v_one_year,
    'fiveYearsAgo', v_five_year,
    'countryAnniversaries', v_country_anniversaries,
    'recentStories', v_recent_stories
  );
end
$$;

commit;
