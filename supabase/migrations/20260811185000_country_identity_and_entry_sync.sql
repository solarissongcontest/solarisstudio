begin;

-- Broaden copied voter identity sync to rows that identify the country through
-- contest_entity_id even when the legacy country_id column is null.
create or replace function public.update_owned_country_identity(
  _name text,
  _native_name text,
  _region text,
  _description text,
  _accent_color text,
  _flag_image text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_id uuid;
  v_name text := nullif(btrim(_name), '');
  v_native_name text := nullif(btrim(_native_name), '');
  v_region text := coalesce(nullif(btrim(_region), ''), 'Terra Solaris');
  v_description text := nullif(btrim(_description), '');
  v_accent text := coalesce(nullif(btrim(_accent_color), ''), '#7dd3fc');
  v_flag text := nullif(btrim(_flag_image), '');
  v_result jsonb;
begin
  select ca.country_id into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid();

  if v_country_id is null then
    raise exception 'This account does not own a country.' using errcode = '42501';
  end if;

  if v_name is null or length(v_name) > 80 then
    raise exception 'Country name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Accent colour must use a six-digit hex value.' using errcode = '22023';
  end if;

  update public.countries
  set
    name = v_name,
    native_name = v_native_name,
    region = v_region,
    description = v_description,
    accent_color = v_accent,
    flag_image = v_flag
  where id = v_country_id;

  update public.contest_entities
  set
    display_name = v_name,
    flag_image = v_flag,
    region = v_region,
    updated_at = now()
  where country_id = v_country_id
    and entity_type = 'global';

  update public.voters v
  set
    name = v_name,
    flag_image = v_flag,
    accent_color = v_accent
  where v.country_id = v_country_id
     or exists (
       select 1
       from public.contest_entities ce
       where ce.id = v.contest_entity_id
         and ce.country_id = v_country_id
         and ce.entity_type = 'global'
     );

  select to_jsonb(c) into v_result
  from public.countries c
  where c.id = v_country_id;

  return v_result;
end;
$$;

revoke all on function public.update_owned_country_identity(text, text, text, text, text, text) from public;
grant execute on function public.update_owned_country_identity(text, text, text, text, text, text) to authenticated, service_role;

-- Artist/song are edition-level entry identity. When a country has separate participant
-- rows for a semi-final and final, update every owned row in that edition together.
create or replace function public.upsert_owned_country_entry(
  _participant_id uuid,
  _edition_id uuid,
  _show_id uuid,
  _artist text,
  _song text,
  _notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_country_id uuid;
  v_entity_id uuid;
  v_existing_id uuid;
  v_target_edition_id uuid;
  v_show_kind text;
  v_row public.participants;
  v_artist text := nullif(btrim(_artist), '');
  v_song text := nullif(btrim(_song), '');
begin
  select ca.country_id into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid();

  if v_country_id is null then
    raise exception 'This account does not own a country.' using errcode = '42501';
  end if;

  if v_artist is null or v_song is null then
    raise exception 'Artist and song are required.' using errcode = '22023';
  end if;

  if length(v_artist) > 160 or length(v_song) > 200 then
    raise exception 'Artist or song name is too long.' using errcode = '22023';
  end if;

  if _participant_id is not null then
    select p.edition_id
    into v_target_edition_id
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.id = _participant_id
      and (p.country_id = v_country_id or ce.country_id = v_country_id)
    limit 1;

    if v_target_edition_id is null then
      raise exception 'Entry not found or not owned by this account.' using errcode = '42501';
    end if;

    update public.participants p
    set
      artist = v_artist,
      song = v_song,
      notes = nullif(btrim(_notes), '')
    where p.edition_id = v_target_edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1
          from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = v_country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row
    from public.participants p
    where p.id = _participant_id;

    return to_jsonb(v_row);
  end if;

  if _edition_id is null or _show_id is null then
    raise exception 'Choose an edition and show.' using errcode = '22023';
  end if;

  select s.kind into v_show_kind
  from public.shows s
  where s.id = _show_id
    and s.edition_id = _edition_id;

  if v_show_kind is null then
    raise exception 'Show does not belong to that edition.' using errcode = '22023';
  end if;

  select p.id into v_existing_id
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = _edition_id
    and (p.country_id = v_country_id or ce.country_id = v_country_id)
  order by p.created_at
  limit 1;

  if v_existing_id is not null then
    update public.participants p
    set
      artist = v_artist,
      song = v_song,
      notes = nullif(btrim(_notes), '')
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1
          from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = v_country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row
    from public.participants p
    where p.id = v_existing_id;

    return to_jsonb(v_row);
  end if;

  select ce.id into v_entity_id
  from public.contest_entities ce
  where ce.edition_id = _edition_id
    and ce.country_id = v_country_id
    and ce.entity_type = 'global'
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
      _edition_id,
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

  insert into public.participants (
    edition_id,
    show_id,
    country_id,
    contest_entity_id,
    artist,
    song,
    notes,
    semi_final
  )
  values (
    _edition_id,
    _show_id,
    v_country_id,
    v_entity_id,
    v_artist,
    v_song,
    nullif(btrim(_notes), ''),
    case when v_show_kind = 'semi-final' then 'semi-final' else 'final' end
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

commit;
