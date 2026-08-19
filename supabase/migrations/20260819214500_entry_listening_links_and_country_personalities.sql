begin;

-- Entry listening links belong to the canonical country entry for an edition.
-- Show-scoped participant rows mirror them so every public entry surface can
-- render the same links without inventing a second song identity.
alter table public.participants
  add column if not exists youtube_url text,
  add column if not exists spotify_url text,
  add column if not exists apple_music_url text;

create or replace function public.normalise_entry_listen_url(
  _value text,
  _service text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v text := nullif(btrim(_value), '');
begin
  if v is null then
    return null;
  end if;

  if length(v) > 1000 then
    raise exception 'Listening links can be at most 1000 characters.' using errcode = '22023';
  end if;

  if v !~* '^https://' then
    raise exception 'Listening links must use https://.' using errcode = '22023';
  end if;

  if _service = 'youtube' then
    if v !~* '^https://((www|music)\.)?youtube\.com/'
       and v !~* '^https://youtu\.be/' then
      raise exception 'Use a YouTube or YouTube Music link.' using errcode = '22023';
    end if;
  elsif _service = 'spotify' then
    if v !~* '^https://(open\.)?spotify\.com/'
       and v !~* '^https://spotify\.link/' then
      raise exception 'Use a Spotify link.' using errcode = '22023';
    end if;
  elsif _service = 'apple' then
    if v !~* '^https://music\.apple\.com/' then
      raise exception 'Use an Apple Music link.' using errcode = '22023';
    end if;
  else
    raise exception 'Unknown listening service.' using errcode = '22023';
  end if;

  return v;
end;
$$;

revoke all on function public.normalise_entry_listen_url(text, text) from public, anon, authenticated;

create or replace function public.update_country_entry_listen_links_internal(
  _country_id uuid,
  _participant_id uuid,
  _edition_id uuid,
  _youtube_url text,
  _spotify_url text,
  _apple_music_url text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edition_id uuid;
  v_youtube text := public.normalise_entry_listen_url(_youtube_url, 'youtube');
  v_spotify text := public.normalise_entry_listen_url(_spotify_url, 'spotify');
  v_apple text := public.normalise_entry_listen_url(_apple_music_url, 'apple');
  v_row public.participants;
begin
  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if _participant_id is not null then
    select p.edition_id
    into v_edition_id
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.id = _participant_id
      and (p.country_id = _country_id or ce.country_id = _country_id)
    limit 1;
  else
    v_edition_id := _edition_id;
  end if;

  if v_edition_id is null then
    raise exception 'Choose a valid edition entry.' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.edition_id = v_edition_id
      and (p.country_id = _country_id or ce.country_id = _country_id)
  ) then
    raise exception 'Create the edition entry before adding listening links.' using errcode = '22023';
  end if;

  update public.participants p
  set
    youtube_url = v_youtube,
    spotify_url = v_spotify,
    apple_music_url = v_apple
  where p.edition_id = v_edition_id
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

  select p.*
  into v_row
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = v_edition_id
    and (p.country_id = _country_id or ce.country_id = _country_id)
  order by (p.show_id is null) desc, p.updated_at desc, p.id desc
  limit 1;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.update_country_entry_listen_links_internal(uuid, uuid, uuid, text, text, text) from public, anon, authenticated;

create or replace function public.update_owned_country_entry_listen_links(
  _participant_id uuid,
  _edition_id uuid,
  _youtube_url text,
  _spotify_url text,
  _apple_music_url text
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

  return public.update_country_entry_listen_links_internal(
    v_country_id,
    _participant_id,
    _edition_id,
    _youtube_url,
    _spotify_url,
    _apple_music_url
  );
end;
$$;

revoke all on function public.update_owned_country_entry_listen_links(uuid, uuid, text, text, text) from public;
grant execute on function public.update_owned_country_entry_listen_links(uuid, uuid, text, text, text) to authenticated, service_role;

create or replace function public.admin_update_country_entry_listen_links(
  _country_id uuid,
  _participant_id uuid,
  _edition_id uuid,
  _youtube_url text,
  _spotify_url text,
  _apple_music_url text
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

  return public.update_country_entry_listen_links_internal(
    _country_id,
    _participant_id,
    _edition_id,
    _youtube_url,
    _spotify_url,
    _apple_music_url
  );
end;
$$;

revoke all on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

-- Any show appearance created after links were entered inherits the canonical
-- edition links automatically.
create or replace function public.inherit_country_entry_listen_links()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source public.participants;
begin
  if new.show_id is null then
    return new;
  end if;

  select p.*
  into v_source
  from public.participants p
  where p.edition_id = new.edition_id
    and p.show_id is null
    and p.country_id = new.country_id
  order by p.updated_at desc, p.id desc
  limit 1;

  if v_source.id is not null then
    new.youtube_url := coalesce(new.youtube_url, v_source.youtube_url);
    new.spotify_url := coalesce(new.spotify_url, v_source.spotify_url);
    new.apple_music_url := coalesce(new.apple_music_url, v_source.apple_music_url);
  end if;

  return new;
end;
$$;

drop trigger if exists participants_inherit_listen_links on public.participants;
create trigger participants_inherit_listen_links
before insert on public.participants
for each row
execute function public.inherit_country_entry_listen_links();

-- Make country/Wiki personalities genuinely different rather than four near-
-- identical header tweaks.
alter table public.country_themes
  drop constraint if exists country_themes_hero_layout_check;

alter table public.country_themes
  add constraint country_themes_hero_layout_check
  check (hero_layout in (
    'classic',
    'editorial',
    'minimal',
    'flag-focus',
    'poster',
    'split',
    'spotlight',
    'broadcast'
  ));

notify pgrst, 'reload schema';

commit;
