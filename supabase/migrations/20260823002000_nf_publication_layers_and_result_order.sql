alter table public.national_finals
  add column if not exists lineup_published boolean not null default false,
  add column if not exists results_published boolean not null default false;

alter table public.national_final_entries
  add column if not exists result_position integer;

update public.national_finals
set lineup_published = true,
    results_published = (winning_entry_id is not null or result_date is not null);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.national_finals'::regclass
      and conname = 'national_finals_results_require_lineup_check'
  ) then
    alter table public.national_finals
      add constraint national_finals_results_require_lineup_check
      check (not results_published or lineup_published);
  end if;
end $$;

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
  v_result_position integer;
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

    v_result_position := case
      when trim(coalesce(v_entry->>'result_position','')) ~ '^[1-9][0-9]*$'
        then (trim(v_entry->>'result_position'))::integer
      else null
    end;

    insert into public.national_final_entries(
      national_final_id, artist, song_title, song_url, position, result_position,
      review_status, review_reason, reviewed_at, removed, next_in_line
    ) values (
      v_nf_id,
      nullif(trim(v_entry->>'artist'),''),
      nullif(trim(v_entry->>'song_title'),''),
      nullif(trim(v_entry->>'song_url'),''),
      v_position,
      v_result_position,
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

create or replace function public.set_country_national_final_publication(
  _country_id uuid,
  _national_final_id uuid,
  _lineup_published boolean default null,
  _results_published boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_lineup boolean;
  v_results boolean;
begin
  if not public.can_manage_country_national_finals(_country_id) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  select * into v_country from public.countries where id = _country_id;
  if v_country.id is null then
    raise exception 'Country not found.' using errcode='22023';
  end if;

  select nf.* into v_nf
  from public.national_finals nf
  left join public.submissions s on s.id = nf.submission_id
  where nf.id = _national_final_id
    and (
      nf.country_id = _country_id
      or (
        nf.country_id is null
        and s.id is not null
        and lower(trim(s.country)) in (lower(trim(v_country.name)), lower(trim(v_country.short_code)))
      )
    );

  if v_nf.id is null then
    raise exception 'National final not found for this country.' using errcode='22023';
  end if;

  v_lineup := coalesce(_lineup_published, v_nf.lineup_published);
  v_results := coalesce(_results_published, v_nf.results_published);
  if v_results then v_lineup := true; end if;
  if not v_lineup then v_results := false; end if;

  update public.national_finals
  set lineup_published = v_lineup,
      results_published = v_results
  where id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'lineup_published', v_lineup,
    'results_published', v_results
  );
end;
$$;

create or replace function public.manage_country_national_finals(_country_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_country public.countries;
  v_result jsonb;
begin
  if not public.can_manage_country_national_finals(_country_id) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

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
        'lineup_published', nf.lineup_published,
        'results_published', nf.results_published,
        'entries', coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', nfe.id,
              'artist', nfe.artist,
              'song_title', nfe.song_title,
              'song_url', nfe.song_url,
              'position', nfe.position,
              'result_position', nfe.result_position,
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

create or replace function public.public_country_national_finals(_country_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
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
        'winning_entry_id', case when nf.results_published then nf.winning_entry_id else null end,
        'edition_id', coalesce(nf.edition_id, e.id),
        'edition_number', coalesce(ed.edition_number, e.edition_number),
        'edition_name', coalesce(ed.name, e.name),
        'edition_slug', coalesce(ed.slug, e.slug),
        'nf_date', coalesce(nf.nf_date, s.nf_exact_date)::text,
        'result_date', case when nf.results_published then coalesce(nf.result_date, s.nf_result_exact_date)::text else null end,
        'lineup_published', nf.lineup_published,
        'results_published', nf.results_published,
        'entries', case when nf.lineup_published then coalesce((
          select jsonb_agg(
            jsonb_build_object(
              'id', nfe.id,
              'artist', nfe.artist,
              'song_title', nfe.song_title,
              'song_url', nfe.song_url,
              'position', nfe.position,
              'result_position', case when nf.results_published then nfe.result_position else null end,
              'winner', case when nf.results_published then nfe.id = nf.winning_entry_id else false end,
              'next_in_line', case when nf.results_published then coalesce(nfe.next_in_line, false) else false end
            ) order by nfe.position nulls last, nfe.artist, nfe.song_title
          )
          from public.national_final_entries nfe
          where nfe.national_final_id = nf.id
            and coalesce(nfe.removed,false) = false
            and nfe.review_status = 'accepted'
        ), '[]'::jsonb) else '[]'::jsonb end
      ) as item
    from public.national_finals nf
    left join public.submissions s on s.id = nf.submission_id
    left join public.editions e on e.id = s.edition_id
    left join public.editions ed on ed.id = nf.edition_id
    where (nf.lineup_published or nf.results_published)
      and (
        nf.country_id = _country_id
        or (
          nf.country_id is null
          and s.id is not null
          and lower(trim(s.country)) in (lower(trim(v_country.name)), lower(trim(v_country.short_code)))
        )
      )
  ) q;

  return v_result;
end;
$$;

revoke all on function public.manage_country_national_finals(uuid) from public, anon;
grant execute on function public.manage_country_national_finals(uuid) to authenticated;
grant execute on function public.set_country_national_final_publication(uuid,uuid,boolean,boolean) to authenticated;
grant execute on function public.public_country_national_finals(uuid) to anon, authenticated;
grant execute on function public.save_country_historical_national_final(uuid,uuid,text,date,date,jsonb,integer,uuid) to authenticated;