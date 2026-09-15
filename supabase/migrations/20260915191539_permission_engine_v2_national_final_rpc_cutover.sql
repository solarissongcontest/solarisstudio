begin;

-- Permission Engine v2 cutover batch 5.
--
-- National-final management is unusual because the country-owner surface spans
-- all historical editions while individual mutations resolve to one edition.
-- Preserve country-owner self service, keep legacy Organizer enforcement strict
-- before authoritative cutover, and become capability-only for non-owners once
-- permission_engine_v2 is globally authoritative.

create or replace function private.studio2_can_manage_country_national_final_scope(
  p_country_id uuid,
  p_edition_id uuid default null,
  p_require_global boolean default false
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_actor uuid := auth.uid();
begin
  if p_country_id is null then
    return false;
  end if;

  if private.studio2_request_is_service_role() then
    return true;
  end if;

  if v_actor is null then
    return false;
  end if;

  if exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = v_actor
      and ca.country_id = p_country_id
      and ca.status = 'active'
  ) then
    return true;
  end if;

  if p_require_global or p_edition_id is null then
    return public.studio2_access_allowed(
      'confirmation.manage',
      null,
      true
    );
  end if;

  return public.studio2_access_allowed(
    'confirmation.manage',
    p_edition_id,
    true
  );
end
$$;

revoke all on function private.studio2_can_manage_country_national_final_scope(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function private.studio2_can_manage_country_national_final_scope(uuid, uuid, boolean)
  to service_role;

create or replace function public.can_manage_country_national_finals(_country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select private.studio2_can_manage_country_national_final_scope(
    _country_id,
    null,
    true
  )
$$;

revoke all on function public.can_manage_country_national_finals(uuid)
  from public, anon;
grant execute on function public.can_manage_country_national_finals(uuid)
  to authenticated, service_role;

-- The all-history management view deliberately requires country ownership or a
-- global confirmation.manage decision. Edition-scoped specialists cannot use a
-- country-wide historical listing as a privilege escalator.
revoke all on function public.manage_country_national_finals(uuid)
  from public, anon;
grant execute on function public.manage_country_national_finals(uuid)
  to authenticated, service_role;

create or replace function public.delete_country_historical_national_final(
  _country_id uuid,
  _national_final_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_scope_edition_id uuid;
begin
  select coalesce(nf.edition_id, s.edition_id)
  into v_scope_edition_id
  from public.national_finals nf
  left join public.submissions s on s.id = nf.submission_id
  where nf.id = _national_final_id
    and nf.country_id = _country_id
    and nf.source = 'manual';

  if not found then
    if not private.studio2_can_manage_country_national_final_scope(
      _country_id,
      null,
      true
    ) then
      raise exception 'You cannot edit national finals for this country.' using errcode='42501';
    end if;
    return false;
  end if;

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    v_scope_edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  delete from public.national_finals
  where id = _national_final_id
    and country_id = _country_id
    and source = 'manual';

  return found;
end
$$;

revoke all on function public.delete_country_historical_national_final(uuid, uuid)
  from public, anon;
grant execute on function public.delete_country_historical_national_final(uuid, uuid)
  to authenticated, service_role;

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
set search_path = pg_catalog, public, private
as $$
declare
  v_nf_id uuid;
  v_existing_edition_id uuid;
  v_entry jsonb;
  v_entry_id uuid;
  v_position integer := 0;
  v_winning_id uuid := null;
  v_result_position integer;
begin
  if _edition_id is null then
    raise exception 'Choose an edition.' using errcode='22023';
  end if;
  if nullif(trim(coalesce(_nf_name,'')), '') is null then
    raise exception 'National final name is required.' using errcode='22023';
  end if;
  if jsonb_typeof(coalesce(_entries, '[]'::jsonb)) <> 'array' then
    raise exception 'Entries must be an array.' using errcode='22023';
  end if;

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    _edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
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
    select nf.id, coalesce(nf.edition_id, s.edition_id)
    into v_nf_id, v_existing_edition_id
    from public.national_finals nf
    left join public.submissions s on s.id = nf.submission_id
    where nf.id = _national_final_id
      and nf.country_id = _country_id
      and nf.source = 'manual';

    if v_nf_id is null then
      raise exception 'Historical national final not found.' using errcode='22023';
    end if;

    if v_existing_edition_id is distinct from _edition_id
       and not private.studio2_can_manage_country_national_final_scope(
         _country_id,
         v_existing_edition_id,
         false
       ) then
      raise exception 'You cannot move this national final from its current edition.' using errcode='42501';
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
end
$$;

revoke all on function public.save_country_historical_national_final(uuid, uuid, text, date, date, jsonb, integer, uuid)
  from public, anon;
grant execute on function public.save_country_historical_national_final(uuid, uuid, text, date, date, jsonb, integer, uuid)
  to authenticated, service_role;

create or replace function public.set_country_national_final_publication(
  _country_id uuid,
  _national_final_id uuid,
  _lineup_published boolean default null,
  _results_published boolean default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_scope_edition_id uuid;
  v_lineup boolean;
  v_results boolean;
begin
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
    if not private.studio2_can_manage_country_national_final_scope(
      _country_id,
      null,
      true
    ) then
      raise exception 'You cannot edit national finals for this country.' using errcode='42501';
    end if;
    raise exception 'National final not found for this country.' using errcode='22023';
  end if;

  v_scope_edition_id := coalesce(
    v_nf.edition_id,
    (select s.edition_id from public.submissions s where s.id = v_nf.submission_id)
  );

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    v_scope_edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
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
end
$$;

revoke all on function public.set_country_national_final_publication(uuid, uuid, boolean, boolean)
  from public, anon;
grant execute on function public.set_country_national_final_publication(uuid, uuid, boolean, boolean)
  to authenticated, service_role;

create or replace function public.set_country_national_final_result_order(
  _country_id uuid,
  _national_final_id uuid,
  _ordered_entry_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_scope_edition_id uuid;
  v_expected_count integer;
  v_unique_count integer;
  v_supplied_count integer;
begin
  select * into v_country
  from public.countries
  where id = _country_id;

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
    if not private.studio2_can_manage_country_national_final_scope(
      _country_id,
      null,
      true
    ) then
      raise exception 'You cannot edit national finals for this country.' using errcode='42501';
    end if;
    raise exception 'National final not found for this country.' using errcode='22023';
  end if;

  v_scope_edition_id := coalesce(
    v_nf.edition_id,
    (select s.edition_id from public.submissions s where s.id = v_nf.submission_id)
  );

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    v_scope_edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  v_supplied_count := coalesce(cardinality(_ordered_entry_ids), 0);

  select count(*) into v_expected_count
  from public.national_final_entries nfe
  where nfe.national_final_id = v_nf.id
    and coalesce(nfe.removed, false) = false
    and nfe.review_status = 'accepted';

  if v_supplied_count <> v_expected_count then
    raise exception 'Result order must include every accepted entry exactly once.' using errcode='22023';
  end if;

  select count(distinct entry_id) into v_unique_count
  from unnest(coalesce(_ordered_entry_ids, array[]::uuid[])) as entry_id;

  if v_unique_count <> v_supplied_count then
    raise exception 'Result order contains the same entry more than once.' using errcode='22023';
  end if;

  if exists (
    select 1
    from unnest(coalesce(_ordered_entry_ids, array[]::uuid[])) as supplied(entry_id)
    where not exists (
      select 1
      from public.national_final_entries nfe
      where nfe.id = supplied.entry_id
        and nfe.national_final_id = v_nf.id
        and coalesce(nfe.removed, false) = false
        and nfe.review_status = 'accepted'
    )
  ) then
    raise exception 'Result order contains an entry outside this national final.' using errcode='22023';
  end if;

  if v_nf.winning_entry_id is not null
     and v_supplied_count > 0
     and _ordered_entry_ids[1] is distinct from v_nf.winning_entry_id then
    raise exception 'The stored winner must stay in first place.' using errcode='22023';
  end if;

  update public.national_final_entries nfe
  set result_position = ordered.position::integer
  from unnest(_ordered_entry_ids) with ordinality as ordered(entry_id, position)
  where nfe.id = ordered.entry_id
    and nfe.national_final_id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'entry_count', v_supplied_count,
    'winning_entry_id', v_nf.winning_entry_id
  );
end
$$;

revoke all on function public.set_country_national_final_result_order(uuid, uuid, uuid[])
  from public, anon;
grant execute on function public.set_country_national_final_result_order(uuid, uuid, uuid[])
  to authenticated, service_role;

create or replace function public.set_country_national_final_winner(
  _country_id uuid,
  _national_final_id uuid,
  _winning_entry_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country public.countries;
  v_nf public.national_finals;
  v_scope_edition_id uuid;
begin
  select * into v_country
  from public.countries
  where id = _country_id;

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
    if not private.studio2_can_manage_country_national_final_scope(
      _country_id,
      null,
      true
    ) then
      raise exception 'You cannot edit national finals for this country.' using errcode='42501';
    end if;
    raise exception 'National final not found for this country.' using errcode='22023';
  end if;

  v_scope_edition_id := coalesce(
    v_nf.edition_id,
    (select s.edition_id from public.submissions s where s.id = v_nf.submission_id)
  );

  if not private.studio2_can_manage_country_national_final_scope(
    _country_id,
    v_scope_edition_id,
    false
  ) then
    raise exception 'You cannot edit national finals for this country.' using errcode='42501';
  end if;

  if _winning_entry_id is not null and not exists (
    select 1
    from public.national_final_entries nfe
    where nfe.id = _winning_entry_id
      and nfe.national_final_id = v_nf.id
      and coalesce(nfe.removed, false) = false
      and nfe.review_status = 'accepted'
  ) then
    raise exception 'Winner must be an accepted active entry from this national final.' using errcode='22023';
  end if;

  update public.national_finals
  set winning_entry_id = _winning_entry_id
  where id = v_nf.id;

  return jsonb_build_object(
    'id', v_nf.id,
    'winning_entry_id', _winning_entry_id
  );
end
$$;

revoke all on function public.set_country_national_final_winner(uuid, uuid, uuid)
  from public, anon;
grant execute on function public.set_country_national_final_winner(uuid, uuid, uuid)
  to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
