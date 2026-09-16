begin;

-- Permission Engine v2 cutover batch 6.
--
-- Remove direct Organizer checks from the legacy country/delegation admin RPCs.
-- Before authoritative cutover these remain strict Organizer + capability paths;
-- after cutover the matching Permission Engine capability is authoritative.

create or replace function public.admin_country_accounts()
returns table(
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
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
  end if;

  return query
  select
    ca.user_id,
    case
      when lower(coalesce(u.email, '')) like '%@country.solaris.invalid' then null
      else u.email::text
    end,
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
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
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
  if not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Missing Solaris capability: delegation.manage' using errcode = '42501';
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
    and entity_type = 'global'
    and historical_identity_override = false;

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
  if not public.studio2_access_allowed('entry.edit', _edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
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

create or replace function public.admin_upsert_country_edition_entry(
  _country_id uuid,
  _edition_id uuid,
  _artist text,
  _song text,
  _notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.studio2_access_allowed('entry.edit', _edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
  end if;

  return public.upsert_country_edition_entry_internal(
    _country_id,
    null,
    _edition_id,
    _artist,
    _song,
    _notes
  );
end;
$$;

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
  if not public.studio2_access_allowed('entry.edit', _edition_id, true) then
    raise exception 'Missing Solaris capability: entry.edit' using errcode = '42501';
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

revoke all on function public.admin_country_accounts() from public, anon;
grant execute on function public.admin_country_accounts() to authenticated, service_role;

revoke all on function public.admin_set_country_account_status(uuid, text, text) from public, anon;
grant execute on function public.admin_set_country_account_status(uuid, text, text) to authenticated, service_role;

revoke all on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) from public, anon;
grant execute on function public.admin_update_country_identity(uuid, text, text, text, text, text, text) to authenticated, service_role;

revoke all on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_country_entry_listen_links(uuid, uuid, uuid, text, text, text) to authenticated, service_role;

revoke all on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_country_edition_entry(uuid, uuid, text, text, text) to authenticated, service_role;

revoke all on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) from public, anon;
grant execute on function public.admin_upsert_country_entry(uuid, uuid, uuid, uuid, text, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
