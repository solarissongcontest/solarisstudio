begin;

-- A country submits one artist/song per edition. Show-scoped participant rows
-- remain appearances for running order, qualification and results, while the
-- show_id = null row is the canonical edition entry edited by the HoD.
create or replace function public.upsert_country_edition_entry_internal(
  _country_id uuid,
  _participant_id uuid,
  _edition_id uuid,
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
  v_target_edition_id uuid;
  v_entity_id uuid;
  v_canonical_id uuid;
  v_row public.participants;
  v_artist text := nullif(btrim(_artist), '');
  v_song text := nullif(btrim(_song), '');
  v_notes text := nullif(btrim(_notes), '');
begin
  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
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
      and (p.country_id = _country_id or ce.country_id = _country_id)
    limit 1;

    if v_target_edition_id is null then
      raise exception 'Entry not found for that country.' using errcode = '22023';
    end if;
  else
    v_target_edition_id := _edition_id;
  end if;

  if v_target_edition_id is null
     or not exists (select 1 from public.editions where id = v_target_edition_id) then
    raise exception 'Choose a valid edition.' using errcode = '22023';
  end if;

  select ce.id
  into v_entity_id
  from public.contest_entities ce
  where ce.edition_id = v_target_edition_id
    and ce.country_id = _country_id
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
      v_target_edition_id,
      'global',
      c.id,
      c.name,
      c.short_code,
      c.flag_image,
      c.region
    from public.countries c
    where c.id = _country_id
    returning id into v_entity_id;
  end if;

  -- Prefer an existing canonical row even if it came from older entity-only data.
  select p.id
  into v_canonical_id
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = v_target_edition_id
    and p.show_id is null
    and (p.country_id = _country_id or ce.country_id = _country_id)
  order by p.updated_at desc, p.created_at desc, p.id desc
  limit 1;

  if v_canonical_id is null then
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
      v_target_edition_id,
      null,
      _country_id,
      v_entity_id,
      v_artist,
      v_song,
      v_notes,
      'final'
    )
    on conflict (edition_id, country_id) where show_id is null
    do update set
      artist = excluded.artist,
      song = excluded.song,
      notes = excluded.notes,
      contest_entity_id = coalesce(public.participants.contest_entity_id, excluded.contest_entity_id)
    returning * into v_row;
  else
    update public.participants p
    set
      country_id = _country_id,
      contest_entity_id = coalesce(p.contest_entity_id, v_entity_id),
      artist = v_artist,
      song = v_song,
      notes = v_notes
    where p.id = v_canonical_id
    returning * into v_row;
  end if;

  -- Show appearances deliberately keep their own show metadata, but never their
  -- own artist/song identity. Notes follow the edition entry as well.
  update public.participants p
  set
    artist = v_artist,
    song = v_song,
    notes = v_notes
  where p.edition_id = v_target_edition_id
    and p.id <> v_row.id
    and (
      p.country_id = _country_id
      or exists (
        select 1
        from public.contest_entities ce
        where ce.id = p.contest_entity_id
          and ce.country_id = _country_id
          and ce.entity_type = 'global'
      )
    );

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.upsert_country_edition_entry_internal(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

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
begin
  select ca.country_id
  into v_country_id
  from public.country_accounts ca
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  -- _show_id remains in the public signature for backwards compatibility but
  -- is intentionally not used: HoD song identity belongs to the edition.
  return public.upsert_country_edition_entry_internal(
    v_country_id,
    _participant_id,
    _edition_id,
    _artist,
    _song,
    _notes
  );
end;
$$;

revoke all on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.upsert_owned_country_entry(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

create or replace function public.admin_upsert_country_entry(
  _country_id uuid,
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
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  return public.upsert_country_edition_entry_internal(
    _country_id,
    _participant_id,
    _edition_id,
    _artist,
    _song,
    _notes
  );
end;
$$;

revoke all on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) to authenticated, service_role;

-- This trigger is already present in production from the show-removal fix. Keep
-- its definition in source control as well so future environments cannot regress.
create or replace function public.preserve_edition_participation_before_show_delete()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.show_id is not null
     and old.country_id is not null
     and not exists (
       select 1
       from public.participants p
       where p.edition_id = old.edition_id
         and p.country_id = old.country_id
         and p.show_id is null
     ) then
    insert into public.participants (
      edition_id,
      country_id,
      artist,
      song,
      running_order,
      semi_final,
      show_id,
      qualified,
      notes,
      contest_entity_id,
      participation_status
    ) values (
      old.edition_id,
      old.country_id,
      old.artist,
      old.song,
      null,
      'final',
      null,
      null,
      coalesce(old.notes, 'Preserved when removed from show line-up'),
      old.contest_entity_id,
      old.participation_status
    )
    on conflict do nothing;
  end if;

  return old;
end;
$$;

revoke all on function public.preserve_edition_participation_before_show_delete() from public;

drop trigger if exists participants_preserve_edition_participation on public.participants;
create trigger participants_preserve_edition_participation
before delete on public.participants
for each row
execute function public.preserve_edition_participation_before_show_delete();

notify pgrst, 'reload schema';

commit;
