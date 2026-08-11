begin;

-- Country accounts are separate from organizer roles. One user can own one country,
-- and each country can have at most one owner.
create table if not exists public.country_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  country_id uuid not null unique references public.countries(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.country_accounts enable row level security;
grant select, insert, update, delete on public.country_accounts to authenticated;
grant all on public.country_accounts to service_role;

drop policy if exists "country accounts read own" on public.country_accounts;
create policy "country accounts read own"
on public.country_accounts
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "country accounts organizer manage" on public.country_accounts;
create policy "country accounts organizer manage"
on public.country_accounts
for all
to authenticated
using (public.has_role(auth.uid(), 'organizer'))
with check (public.has_role(auth.uid(), 'organizer'));

create or replace function public.owns_country(_country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.country_accounts ca
    where ca.user_id = auth.uid()
      and ca.country_id = _country_id
  );
$$;

revoke all on function public.owns_country(uuid) from public;
grant execute on function public.owns_country(uuid) to authenticated, service_role;

-- Public signup picker. It exposes only unclaimed country identity, never account IDs.
create or replace function public.available_country_claims()
returns table (
  id uuid,
  name text,
  short_code text,
  flag_image text,
  accent_color text,
  region text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id,
    c.name,
    c.short_code,
    c.flag_image,
    c.accent_color,
    c.region
  from public.countries c
  where not exists (
    select 1
    from public.country_accounts ca
    where ca.country_id = c.id
  )
  order by c.name;
$$;

revoke all on function public.available_country_claims() from public;
grant execute on function public.available_country_claims() to anon, authenticated, service_role;

-- Existing non-organizer users, including an OAuth account created before this feature,
-- can claim exactly one still-unclaimed country.
create or replace function public.claim_country_account(_country_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if public.has_role(v_user_id, 'organizer') then
    raise exception 'Organizer accounts do not claim country accounts.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if exists (select 1 from public.country_accounts where user_id = v_user_id) then
    raise exception 'This account already owns a country.' using errcode = '23505';
  end if;

  begin
    insert into public.country_accounts (user_id, country_id)
    values (v_user_id, _country_id);
  exception
    when unique_violation then
      raise exception 'That country already has an account.' using errcode = '23505';
  end;

  return _country_id;
end;
$$;

revoke all on function public.claim_country_account(uuid) from public;
grant execute on function public.claim_country_account(uuid) to authenticated, service_role;

-- Country selected during email/password signup is claimed in the same transaction that
-- creates the auth user, so two people racing for one country cannot both succeed.
create or replace function public.claim_country_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_country_id uuid;
  v_country_text text;
begin
  if coalesce(new.raw_user_meta_data ->> 'account_type', '') <> 'country' then
    return new;
  end if;

  v_country_text := nullif(new.raw_user_meta_data ->> 'country_id', '');
  if v_country_text is null then
    raise exception 'Choose a country for this account.' using errcode = '22023';
  end if;

  begin
    v_country_id := v_country_text::uuid;
  exception
    when invalid_text_representation then
      raise exception 'Invalid country selection.' using errcode = '22023';
  end;

  if not exists (select 1 from public.countries where id = v_country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  begin
    insert into public.country_accounts (user_id, country_id)
    values (new.id, v_country_id);
  exception
    when unique_violation then
      raise exception 'That country already has an account.' using errcode = '23505';
  end;

  return new;
end;
$$;

drop trigger if exists on_solaris_country_signup on auth.users;
create trigger on_solaris_country_signup
after insert on auth.users
for each row execute function public.claim_country_from_signup();

-- Structured Terra Solaris country information.
create table if not exists public.country_profiles (
  country_id uuid primary key references public.countries(id) on delete cascade,
  capital text,
  government_type text,
  leader_name text,
  leader_title text,
  demonym text,
  official_languages text,
  currency text,
  motto text,
  population text,
  established text,
  summary text,
  updated_at timestamptz not null default now()
);

create table if not exists public.country_profile_sections (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  heading text not null,
  body text not null default '',
  image_url text,
  image_caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists country_profile_sections_country_sort_idx
  on public.country_profile_sections(country_id, sort_order, created_at);

create table if not exists public.country_media (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  storage_path text not null unique,
  public_url text not null,
  caption text,
  alt_text text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists country_media_country_sort_idx
  on public.country_media(country_id, sort_order, created_at);

alter table public.country_profiles enable row level security;
alter table public.country_profile_sections enable row level security;
alter table public.country_media enable row level security;

grant select on public.country_profiles, public.country_profile_sections, public.country_media to anon, authenticated;
grant insert, update, delete on public.country_profiles, public.country_profile_sections, public.country_media to authenticated;
grant all on public.country_profiles, public.country_profile_sections, public.country_media to service_role;

drop policy if exists "country profiles public read" on public.country_profiles;
create policy "country profiles public read"
on public.country_profiles for select
using (true);

drop policy if exists "country profiles owner write" on public.country_profiles;
create policy "country profiles owner write"
on public.country_profiles for all to authenticated
using (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'))
with check (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'));

drop policy if exists "country sections public read" on public.country_profile_sections;
create policy "country sections public read"
on public.country_profile_sections for select
using (true);

drop policy if exists "country sections owner write" on public.country_profile_sections;
create policy "country sections owner write"
on public.country_profile_sections for all to authenticated
using (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'))
with check (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'));

drop policy if exists "country media public read" on public.country_media;
create policy "country media public read"
on public.country_media for select
using (true);

drop policy if exists "country media owner write" on public.country_media;
create policy "country media owner write"
on public.country_media for all to authenticated
using (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'))
with check (public.owns_country(country_id) or public.has_role(auth.uid(), 'organizer'));

create or replace function public.touch_country_content_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_country_accounts_updated_at on public.country_accounts;
create trigger touch_country_accounts_updated_at
before update on public.country_accounts
for each row execute function public.touch_country_content_updated_at();

drop trigger if exists touch_country_profiles_updated_at on public.country_profiles;
create trigger touch_country_profiles_updated_at
before update on public.country_profiles
for each row execute function public.touch_country_content_updated_at();

drop trigger if exists touch_country_sections_updated_at on public.country_profile_sections;
create trigger touch_country_sections_updated_at
before update on public.country_profile_sections
for each row execute function public.touch_country_content_updated_at();

-- Country owners may update only public identity fields. Stable short_code/URL identity,
-- statistics and participation metadata stay organizer-controlled.
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

  -- Keep edition-scoped global identity snapshots in sync as well.
  update public.contest_entities
  set
    display_name = v_name,
    flag_image = v_flag,
    region = v_region,
    updated_at = now()
  where country_id = v_country_id
    and entity_type = 'global';

  -- Voter rows can also contain copied identity fields.
  update public.voters
  set
    name = v_name,
    flag_image = v_flag,
    accent_color = v_accent
  where country_id = v_country_id;

  select to_jsonb(c) into v_result
  from public.countries c
  where c.id = v_country_id;

  return v_result;
end;
$$;

revoke all on function public.update_owned_country_identity(text, text, text, text, text, text) from public;
grant execute on function public.update_owned_country_identity(text, text, text, text, text, text) to authenticated, service_role;

-- Country owners can change only artist/song/notes for their own historical entry,
-- or add their country to an edition/show where it has no stored entry yet.
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
    update public.participants p
    set
      artist = v_artist,
      song = v_song,
      notes = nullif(btrim(_notes), '')
    where p.id = _participant_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1
          from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = v_country_id
        )
      )
    returning p.* into v_row;

    if v_row.id is null then
      raise exception 'Entry not found or not owned by this account.' using errcode = '42501';
    end if;

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
    where p.id = v_existing_id
    returning p.* into v_row;

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

-- Public image bucket for flags, article images and galleries. Owners are restricted
-- to a top-level folder named with their own country UUID.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'country-media',
  'country-media',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "country media bucket public read" on storage.objects;
create policy "country media bucket public read"
on storage.objects
for select
using (bucket_id = 'country-media');

drop policy if exists "country media bucket owner insert" on storage.objects;
create policy "country media bucket owner insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'country-media'
  and (
    public.has_role(auth.uid(), 'organizer')
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "country media bucket owner update" on storage.objects;
create policy "country media bucket owner update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'country-media'
  and (
    public.has_role(auth.uid(), 'organizer')
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
)
with check (
  bucket_id = 'country-media'
  and (
    public.has_role(auth.uid(), 'organizer')
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
);

drop policy if exists "country media bucket owner delete" on storage.objects;
create policy "country media bucket owner delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'country-media'
  and (
    public.has_role(auth.uid(), 'organizer')
    or exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
);

commit;
