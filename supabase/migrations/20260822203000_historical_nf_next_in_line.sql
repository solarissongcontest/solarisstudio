alter table public.national_final_entries
  add column if not exists next_in_line boolean not null default false;

create unique index if not exists national_final_entries_one_next_in_line_idx
  on public.national_final_entries(national_final_id)
  where next_in_line = true and removed = false;

create or replace function public.save_country_historical_national_final(
  _country_id uuid,
  _edition_id uuid,
  _nf_name text,
  _nf_date date default null,
  _result_date date default null,
  _entries jsonb default '[]'::jsonb,
  _winning_position integer default null,
  _national_final_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nf_id uuid;
  v_entry jsonb;
  v_entry_id uuid;
  v_position integer := 0;
  v_winning_id uuid := null;
begin
  if not public.can_manage_country_national_finals(_country_id) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  if _edition_id is null then
    raise exception 'Choose an edition.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(_nf_name,'')), '') is null then
    raise exception 'National final name is required.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'Entries must be an array.' using errcode='22023';
  end if;

  if _national_final_id is null then
    insert into public.national_finals(
      submission_id, country_id, edition_id, nf_name, expected_entry_count,
      winning_entry_id, nf_date, result_date, source
    ) values (
      null, _country_id, _edition_id, trim(_nf_name), jsonb_array_length(coalesce(_entries,'[]'::jsonb)),
      null, _nf_date, _result_date, 'manual'
    ) returning id into v_nf_id;
  else
    select id into v_nf_id
    from public.national_finals
    where id = _national_final_id
      and country_id = _country_id
      and source = 'manual';
    if v_nf_id is null then
      raise exception 'Historical national final not found.' using errcode='22023';
    end if;

    update public.national_finals
    set edition_id = _edition_id,
        nf_name = trim(_nf_name),
        nf_date = _nf_date,
        result_date = _result_date,
        expected_entry_count = jsonb_array_length(coalesce(_entries,'[]'::jsonb)),
        winning_entry_id = null
    where id = v_nf_id;

    delete from public.national_final_entries where national_final_id = v_nf_id;
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(_entries,'[]'::jsonb)) loop
    v_position := v_position + 1;
    if nullif(trim(coalesce(v_entry->>'artist','')), '') is null
       and nullif(trim(coalesce(v_entry->>'song_title','')), '') is null then
      continue;
    end if;

    insert into public.national_final_entries(
      national_final_id, artist, song_title, song_url, position,
      review_status, review_reason, reviewed_at, removed, next_in_line
    ) values (
      v_nf_id,
      nullif(trim(v_entry->>'artist'),''),
      nullif(trim(v_entry->>'song_title'),''),
      nullif(trim(v_entry->>'song_url'),''),
      v_position,
      'accepted', null, now(), false,
      lower(coalesce(v_entry->>'next_in_line', 'false')) in ('true','1','yes')
    ) returning id into v_entry_id;

    if _winning_position is not null and v_position = _winning_position then
      v_winning_id := v_entry_id;
    end if;
  end loop;

  update public.national_finals
  set winning_entry_id = v_winning_id,
      expected_entry_count = (
        select count(*) from public.national_final_entries where national_final_id = v_nf_id and removed = false
      )
  where id = v_nf_id;

  return v_nf_id;
end;
$$;

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
        'nf_date', coalesce(nf.nf_date::text, s.nf_exact_date),
        'result_date', coalesce(nf.result_date::text, s.nf_result_exact_date),
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
