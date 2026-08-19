begin;

-- A Solaris entry belongs to a country for an edition. Rows in participants with
-- show_id set are appearances of that one entry in individual shows; they are not
-- separate songs. These RPCs intentionally accept no show id or participant id.

create unique index if not exists participants_one_showless_country_entry_per_edition
  on public.participants (edition_id, country_id)
  where show_id is null and country_id is not null;

create or replace function public.upsert_owned_country_edition_entry(
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
  v_country_id uuid;
  v_participant_id uuid;
  v_artist text := trim(coalesce(_artist, ''));
  v_song text := trim(coalesce(_song, ''));
  v_notes text := nullif(trim(coalesce(_notes, '')), '');
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  select ca.country_id
    into v_country_id
  from public.country_accounts ca
  where ca.user_id = v_user_id
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'An active country account is required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.editions e where e.id = _edition_id) then
    raise exception 'Edition not found.' using errcode = '22023';
  end if;

  if v_artist = '' or v_song = '' then
    raise exception 'Artist and song are required.' using errcode = '22023';
  end if;

  -- Prefer the showless canonical row when one exists, otherwise any appearance
  -- row can anchor the logical edition entry. The sync trigger will also keep
  -- sibling appearance rows aligned, but we update them explicitly here so this
  -- contract remains correct even if trigger behaviour changes later.
  select p.id
    into v_participant_id
  from public.participants p
  where p.edition_id = _edition_id
    and p.country_id = v_country_id
  order by (p.show_id is null) desc, p.updated_at desc, p.created_at desc, p.id
  limit 1;

  if v_participant_id is null then
    insert into public.participants (
      edition_id,
      country_id,
      artist,
      song,
      notes,
      show_id,
      participation_status
    ) values (
      _edition_id,
      v_country_id,
      v_artist,
      v_song,
      v_notes,
      null,
      'confirmed'
    )
    returning id into v_participant_id;
  else
    update public.participants p
    set artist = v_artist,
        song = v_song,
        notes = v_notes
    where p.edition_id = _edition_id
      and p.country_id = v_country_id;
  end if;

  return v_participant_id;
end;
$$;

revoke all on function public.upsert_owned_country_edition_entry(uuid, text, text, text) from public, anon;
grant execute on function public.upsert_owned_country_edition_entry(uuid, text, text, text) to authenticated, service_role;

create or replace function public.admin_upsert_country_edition_entry(
  _country_id uuid,
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_participant_id uuid;
  v_artist text := trim(coalesce(_artist, ''));
  v_song text := trim(coalesce(_song, ''));
  v_notes text := nullif(trim(coalesce(_notes, '')), '');
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.countries c where c.id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if not exists (select 1 from public.editions e where e.id = _edition_id) then
    raise exception 'Edition not found.' using errcode = '22023';
  end if;

  if v_artist = '' or v_song = '' then
    raise exception 'Artist and song are required.' using errcode = '22023';
  end if;

  select p.id
    into v_participant_id
  from public.participants p
  where p.edition_id = _edition_id
    and p.country_id = _country_id
  order by (p.show_id is null) desc, p.updated_at desc, p.created_at desc, p.id
  limit 1;

  if v_participant_id is null then
    insert into public.participants (
      edition_id,
      country_id,
      artist,
      song,
      notes,
      show_id,
      participation_status
    ) values (
      _edition_id,
      _country_id,
      v_artist,
      v_song,
      v_notes,
      null,
      'confirmed'
    )
    returning id into v_participant_id;
  else
    update public.participants p
    set artist = v_artist,
        song = v_song,
        notes = v_notes
    where p.edition_id = _edition_id
      and p.country_id = _country_id;
  end if;

  return v_participant_id;
end;
$$;

revoke all on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
