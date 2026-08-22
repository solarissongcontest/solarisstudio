create or replace function public.public_country_national_finals(_country_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  v_country public.countries;
  v_result jsonb;
begin
  select * into v_country from public.countries where id = _country_id;
  if v_country.id is null then return '[]'::jsonb; end if;

  select coalesce(jsonb_agg(item order by edition_number desc nulls last, nf_name), '[]'::jsonb)
  into v_result
  from (
    select
      coalesce(ed.edition_number, e.edition_number) as edition_number,
      nf.nf_name,
      jsonb_build_object(
        'id', nf.id,
        'name', nf.nf_name,
        'expected_entry_count', nf.expected_entry_count,
        'winning_entry_id', nf.winning_entry_id,
        'edition_id', coalesce(nf.edition_id, e.id),
        'edition_number', coalesce(ed.edition_number, e.edition_number),
        'edition_name', coalesce(ed.name, e.name),
        'edition_slug', coalesce(ed.slug, e.slug),
        'nf_date', coalesce(nf.nf_date, s.nf_exact_date)::text,
        'result_date', coalesce(nf.result_date, s.nf_result_exact_date)::text,
        'source', nf.source,
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', nfe.id,
              'artist', nfe.artist,
              'song_title', nfe.song_title,
              'song_url', nfe.song_url,
              'position', nfe.position,
              'winner', nfe.id = nf.winning_entry_id,
              'next_in_line', coalesce(nfe.next_in_line, false)
            ) order by nfe.position nulls last, nfe.artist, nfe.song_title
          )
          from public.national_final_entries nfe
          where nfe.national_final_id = nf.id
            and coalesce(nfe.removed,false) = false
            and nfe.review_status = 'accepted'
        ), '[]'::jsonb)
      ) as item
    from public.national_finals nf
    left join public.submissions s on s.id = nf.submission_id
    left join public.editions e on e.id = s.edition_id
    left join public.editions ed on ed.id = nf.edition_id
    where nf.country_id = _country_id
       or (
         nf.country_id is null
         and s.id is not null
         and lower(trim(s.country)) in (lower(trim(v_country.name)), lower(trim(v_country.short_code)))
       )
  ) q;

  return v_result;
end;
$$;
