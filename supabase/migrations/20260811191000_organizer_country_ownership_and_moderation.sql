begin;

alter table public.country_accounts
  add column if not exists status text not null default 'active',
  add column if not exists suspension_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'country_accounts_status_check'
      and conrelid = 'public.country_accounts'::regclass
  ) then
    alter table public.country_accounts
      add constraint country_accounts_status_check
      check (status in ('active', 'suspended'));
  end if;
end;
$$;

-- Suspension removes country-owner write powers. Organizers still bypass owner checks
-- through the organizer role, so moderation never locks an organizer out of Studio.
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
      and ca.status = 'active'
  );
$$;

revoke all on function public.owns_country(uuid) from public;
grant execute on function public.owns_country(uuid) to authenticated, service_role;

-- Organizers may also claim exactly one country. The same one-user/one-country and
-- one-country/one-owner unique constraints still apply.
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

  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if exists (select 1 from public.country_accounts where user_id = v_user_id) then
    raise exception 'This account already owns a country.' using errcode = '23505';
  end if;

  begin
    insert into public.country_accounts (user_id, country_id, status)
    values (v_user_id, _country_id, 'active');
  exception
    when unique_violation then
      raise exception 'That country already has an account.' using errcode = '23505';
  end;

  return _country_id;
end;
$$;

revoke all on function public.claim_country_account(uuid) from public;
grant execute on function public.claim_country_account(uuid) to authenticated, service_role;

-- Organizer-only account directory. Email addresses are visible only through this
-- restricted function and are never exposed through public country APIs.
create or replace function public.admin_country_accounts()
returns table (
  user_id uuid,
  email text,
  country_id uuid,
  country_name text,
  short_code text,
  flag_image text,
  status text,
  suspension_reason text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  return query
  select
    ca.user_id,
    u.email::text,
    ca.country_id,
    c.name,
    c.short_code,
    c.flag_image,
    ca.status,
    ca.suspension_reason,
    ca.created_at,
    ca.updated_at
  from public.country_accounts ca
  join auth.users u on u.id = ca.user_id
  join public.countries c on c.id = ca.country_id
  order by c.name;
end;
$$;

revoke all on function public.admin_country_accounts() from public;
grant execute on function public.admin_country_accounts() to authenticated, service_role;

create or replace function public.admin_set_country_account_status(
  _user_id uuid,
  _status text,
  _reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  if _status not in ('active', 'suspended') then
    raise exception 'Invalid account status.' using errcode = '22023';
  end if;

  update public.country_accounts
  set
    status = _status,
    suspension_reason = case when _status = 'suspended' then nullif(btrim(_reason), '') else null end,
    suspended_at = case when _status = 'suspended' then now() else null end,
    suspended_by = case when _status = 'suspended' then auth.uid() else null end,
    updated_at = now()
  where user_id = _user_id
  returning to_jsonb(country_accounts.*) into v_result;

  if v_result is null then
    raise exception 'Country account not found.' using errcode = '22023';
  end if;

  return v_result;
end;
$$;

revoke all on function public.admin_set_country_account_status(uuid, text, text) from public;
grant execute on function public.admin_set_country_account_status(uuid, text, text) to authenticated, service_role;

-- Owner edits are denied while the country account is suspended.
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
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  if v_name is null or length(v_name) > 80 then
    raise exception 'Country name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Accent colour must use a six-digit hex value.' using errcode = '22023';
  end if;

  update public.countries
  set name = v_name,
      native_name = v_native_name,
      region = v_region,
      description = v_description,
      accent_color = v_accent,
      flag_image = v_flag
  where id = v_country_id;

  update public.contest_entities
  set display_name = v_name,
      flag_image = v_flag,
      region = v_region,
      updated_at = now()
  where country_id = v_country_id
    and entity_type = 'global';

  update public.voters v
  set name = v_name,
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

create or replace function public.admin_update_country_identity(
  _country_id uuid,
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
  v_name text := nullif(btrim(_name), '');
  v_native_name text := nullif(btrim(_native_name), '');
  v_region text := coalesce(nullif(btrim(_region), ''), 'Terra Solaris');
  v_description text := nullif(btrim(_description), '');
  v_accent text := coalesce(nullif(btrim(_accent_color), ''), '#7dd3fc');
  v_flag text := nullif(btrim(_flag_image), '');
  v_result jsonb;
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.countries where id = _country_id) then
    raise exception 'Country not found.' using errcode = '22023';
  end if;

  if v_name is null or length(v_name) > 80 then
    raise exception 'Country name must be between 1 and 80 characters.' using errcode = '22023';
  end if;

  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'Accent colour must use a six-digit hex value.' using errcode = '22023';
  end if;

  update public.countries
  set name = v_name,
      native_name = v_native_name,
      region = v_region,
      description = v_description,
      accent_color = v_accent,
      flag_image = v_flag
  where id = _country_id;

  update public.contest_entities
  set display_name = v_name,
      flag_image = v_flag,
      region = v_region,
      updated_at = now()
  where country_id = _country_id
    and entity_type = 'global';

  update public.voters v
  set name = v_name,
      flag_image = v_flag,
      accent_color = v_accent
  where v.country_id = _country_id
     or exists (
       select 1
       from public.contest_entities ce
       where ce.id = v.contest_entity_id
         and ce.country_id = _country_id
         and ce.entity_type = 'global'
     );

  select to_jsonb(c) into v_result
  from public.countries c
  where c.id = _country_id;

  return v_result;
end;
$$;

revoke all on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) from public;
grant execute on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) to authenticated, service_role;

-- Shared entry editing rules. Owners use the owner RPC; organizers can target any country
-- through the admin RPC. Artist/song changes stay synchronized across an edition.
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
  where ca.user_id = auth.uid()
    and ca.status = 'active';

  if v_country_id is null then
    raise exception 'This country account is unavailable or suspended.' using errcode = '42501';
  end if;

  if v_artist is null or v_song is null then
    raise exception 'Artist and song are required.' using errcode = '22023';
  end if;

  if length(v_artist) > 160 or length(v_song) > 200 then
    raise exception 'Artist or song name is too long.' using errcode = '22023';
  end if;

  if _participant_id is not null then
    select p.edition_id into v_target_edition_id
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.id = _participant_id
      and (p.country_id = v_country_id or ce.country_id = v_country_id)
    limit 1;

    if v_target_edition_id is null then
      raise exception 'Entry not found or not owned by this account.' using errcode = '42501';
    end if;

    update public.participants p
    set artist = v_artist,
        song = v_song,
        notes = nullif(btrim(_notes), '')
    where p.edition_id = v_target_edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = v_country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row from public.participants p where p.id = _participant_id;
    return to_jsonb(v_row);
  end if;

  if _edition_id is null or _show_id is null then
    raise exception 'Choose an edition and show.' using errcode = '22023';
  end if;

  select s.kind into v_show_kind
  from public.shows s
  where s.id = _show_id and s.edition_id = _edition_id;

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
    set artist = v_artist,
        song = v_song,
        notes = nullif(btrim(_notes), '')
    where p.edition_id = _edition_id
      and (
        p.country_id = v_country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = v_country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row from public.participants p where p.id = v_existing_id;
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
      edition_id, entity_type, country_id, display_name, abbreviation, flag_image, region
    )
    select _edition_id, 'global', c.id, c.name, c.short_code, c.flag_image, c.region
    from public.countries c
    where c.id = v_country_id
    returning id into v_entity_id;
  end if;

  insert into public.participants (
    edition_id, show_id, country_id, contest_entity_id, artist, song, notes, semi_final
  )
  values (
    _edition_id, _show_id, v_country_id, v_entity_id, v_artist, v_song,
    nullif(btrim(_notes), ''),
    case when v_show_kind = 'semi-final' then 'semi-final' else 'final' end
  )
  returning * into v_row;

  return to_jsonb(v_row);
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
declare
  v_entity_id uuid;
  v_existing_id uuid;
  v_target_edition_id uuid;
  v_show_kind text;
  v_row public.participants;
  v_artist text := nullif(btrim(_artist), '');
  v_song text := nullif(btrim(_song), '');
begin
  if not public.has_role(auth.uid(), 'organizer') then
    raise exception 'Organizer access required.' using errcode = '42501';
  end if;

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
    select p.edition_id into v_target_edition_id
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.id = _participant_id
      and (p.country_id = _country_id or ce.country_id = _country_id)
    limit 1;

    if v_target_edition_id is null then
      raise exception 'Entry not found for that country.' using errcode = '22023';
    end if;

    update public.participants p
    set artist = v_artist,
        song = v_song,
        notes = nullif(btrim(_notes), '')
    where p.edition_id = v_target_edition_id
      and (
        p.country_id = _country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = _country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row from public.participants p where p.id = _participant_id;
    return to_jsonb(v_row);
  end if;

  if _edition_id is null or _show_id is null then
    raise exception 'Choose an edition and show.' using errcode = '22023';
  end if;

  select s.kind into v_show_kind
  from public.shows s
  where s.id = _show_id and s.edition_id = _edition_id;

  if v_show_kind is null then
    raise exception 'Show does not belong to that edition.' using errcode = '22023';
  end if;

  select p.id into v_existing_id
  from public.participants p
  left join public.contest_entities ce on ce.id = p.contest_entity_id
  where p.edition_id = _edition_id
    and (p.country_id = _country_id or ce.country_id = _country_id)
  order by p.created_at
  limit 1;

  if v_existing_id is not null then
    update public.participants p
    set artist = v_artist,
        song = v_song,
        notes = nullif(btrim(_notes), '')
    where p.edition_id = _edition_id
      and (
        p.country_id = _country_id
        or exists (
          select 1 from public.contest_entities ce
          where ce.id = p.contest_entity_id
            and ce.country_id = _country_id
            and ce.entity_type = 'global'
        )
      );

    select p.* into v_row from public.participants p where p.id = v_existing_id;
    return to_jsonb(v_row);
  end if;

  select ce.id into v_entity_id
  from public.contest_entities ce
  where ce.edition_id = _edition_id
    and ce.country_id = _country_id
    and ce.entity_type = 'global'
  limit 1;

  if v_entity_id is null then
    insert into public.contest_entities (
      edition_id, entity_type, country_id, display_name, abbreviation, flag_image, region
    )
    select _edition_id, 'global', c.id, c.name, c.short_code, c.flag_image, c.region
    from public.countries c
    where c.id = _country_id
    returning id into v_entity_id;
  end if;

  insert into public.participants (
    edition_id, show_id, country_id, contest_entity_id, artist, song, notes, semi_final
  )
  values (
    _edition_id, _show_id, _country_id, v_entity_id, v_artist, v_song,
    nullif(btrim(_notes), ''),
    case when v_show_kind = 'semi-final' then 'semi-final' else 'final' end
  )
  returning * into v_row;

  return to_jsonb(v_row);
end;
$$;

revoke all on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) from public;
grant execute on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) to authenticated, service_role;

-- Rebuild storage write policies so suspended owners cannot upload, replace or delete
-- country media. Organizers can always moderate every country's media folder.
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
      select 1 from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.status = 'active'
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
      select 1 from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.status = 'active'
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
)
with check (
  bucket_id = 'country-media'
  and (
    public.has_role(auth.uid(), 'organizer')
    or exists (
      select 1 from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.status = 'active'
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
      select 1 from public.country_accounts ca
      where ca.user_id = auth.uid()
        and ca.status = 'active'
        and ca.country_id::text = (storage.foldername(name))[1]
    )
  )
);

commit;
