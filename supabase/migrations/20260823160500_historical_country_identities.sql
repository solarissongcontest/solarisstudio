begin;

-- Historical country names and flags are presentation metadata only. The canonical
-- country_id, short code, HOD assignments and voting identities never change.
alter table public.contest_entities
  add column if not exists historical_identity_override boolean not null default false;

create table if not exists public.country_edition_identities (
  country_id uuid not null references public.countries(id) on delete cascade,
  edition_id uuid not null references public.editions(id) on delete cascade,
  display_name text not null,
  flag_image text,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (country_id, edition_id),
  constraint country_edition_identities_name_check
    check (length(btrim(display_name)) between 1 and 80)
);

create index if not exists country_edition_identities_country_idx
  on public.country_edition_identities(country_id, edition_id);

comment on table public.country_edition_identities is
  'Display-only historical country names/flags by edition. Never used as voting or HOD identity.';

alter table public.country_edition_identities enable row level security;

drop policy if exists "published historical identities are public" on public.country_edition_identities;
create policy "published historical identities are public"
on public.country_edition_identities
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.editions e
    where e.id = country_edition_identities.edition_id
      and e.published = true
  )
);

drop policy if exists "owners can read own historical identities" on public.country_edition_identities;
create policy "owners can read own historical identities"
on public.country_edition_identities
for select
to authenticated
using (
  public.owns_country(country_id)
  or public.has_role(auth.uid(), 'organizer')
);

-- No direct INSERT/UPDATE/DELETE policy is intentionally provided. Country owners
-- write through the RPCs below so an alias can never change canonical voting keys.

create or replace function public.owned_country_identity_history()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_country uuid;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode='42501';
  end if;

  select country_id into v_country
  from public.country_accounts
  where user_id = v_user
    and status = 'active';

  if v_country is null then
    raise exception 'No active country account' using errcode='42501';
  end if;

  select jsonb_build_object(
    'country_id', v_country,
    'editions', coalesce(jsonb_agg(jsonb_build_object(
      'edition_id', q.edition_id,
      'edition_number', q.edition_number,
      'edition_name', q.edition_name,
      'display_name', q.display_name,
      'flag_image', q.flag_image
    ) order by q.edition_number desc nulls last, q.edition_name), '[]'::jsonb)
  ) into v_result
  from (
    select distinct
      e.id as edition_id,
      e.edition_number,
      e.name as edition_name,
      cei.display_name,
      cei.flag_image
    from public.participants p
    join public.editions e on e.id = p.edition_id
    left join public.country_edition_identities cei
      on cei.country_id = v_country
     and cei.edition_id = e.id
    where p.country_id = v_country
       or exists (
         select 1
         from public.contest_entities ce
         where ce.id = p.contest_entity_id
           and ce.country_id = v_country
           and ce.entity_type = 'global'
       )
  ) q;

  return coalesce(
    v_result,
    jsonb_build_object('country_id',v_country,'editions','[]'::jsonb)
  );
end;
$$;

revoke all on function public.owned_country_identity_history() from public, anon;
grant execute on function public.owned_country_identity_history() to authenticated;

create or replace function public.set_owned_country_edition_identity(
  _edition_id uuid,
  _display_name text,
  _flag_image text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_country uuid;
  v_name text := nullif(btrim(_display_name), '');
  v_flag text := nullif(btrim(_flag_image), '');
  v_entity uuid;
  v_short_code text;
  v_region text;
  v_result jsonb;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode='42501';
  end if;

  select country_id into v_country
  from public.country_accounts
  where user_id = v_user
    and status = 'active';

  if v_country is null then
    raise exception 'No active country account' using errcode='42501';
  end if;

  if v_name is null or length(v_name) > 80 then
    raise exception 'Historical country name must be between 1 and 80 characters.' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.participants p
    left join public.contest_entities ce on ce.id = p.contest_entity_id
    where p.edition_id = _edition_id
      and (p.country_id = v_country or ce.country_id = v_country)
  ) then
    raise exception 'Your country did not participate in that edition.' using errcode='22023';
  end if;

  select short_code, region
    into v_short_code, v_region
  from public.countries
  where id = v_country;

  insert into public.country_edition_identities(
    country_id, edition_id, display_name, flag_image, updated_by, created_at, updated_at
  )
  values(v_country, _edition_id, v_name, v_flag, v_user, now(), now())
  on conflict(country_id, edition_id)
  do update set
    display_name = excluded.display_name,
    flag_image = excluded.flag_image,
    updated_by = excluded.updated_by,
    updated_at = now();

  select id into v_entity
  from public.contest_entities
  where edition_id = _edition_id
    and country_id = v_country
    and entity_type = 'global'
  limit 1;

  if v_entity is null then
    insert into public.contest_entities(
      edition_id, entity_type, country_id, display_name, abbreviation,
      flag_image, region, historical_identity_override
    )
    values(
      _edition_id, 'global', v_country, v_name, v_short_code,
      v_flag, v_region, true
    )
    returning id into v_entity;
  else
    update public.contest_entities
    set display_name = v_name,
        abbreviation = v_short_code,
        flag_image = v_flag,
        historical_identity_override = true,
        updated_at = now()
    where id = v_entity;
  end if;

  -- Keep every show appearance linked to the edition entity, but never alter
  -- country_id. That canonical country key is what voting and integrity use.
  update public.participants
  set contest_entity_id = v_entity,
      updated_at = now()
  where edition_id = _edition_id
    and country_id = v_country
    and contest_entity_id is distinct from v_entity;

  select jsonb_build_object(
    'country_id', v_country,
    'edition_id', _edition_id,
    'display_name', v_name,
    'flag_image', v_flag,
    'contest_entity_id', v_entity
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_owned_country_edition_identity(uuid,text,text) from public, anon;
grant execute on function public.set_owned_country_edition_identity(uuid,text,text) to authenticated;

create or replace function public.clear_owned_country_edition_identity(_edition_id uuid)
returns boolean
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $$
declare
  v_user uuid := auth.uid();
  v_country uuid;
  v_name text;
  v_short_code text;
  v_flag text;
  v_region text;
begin
  if v_user is null then
    raise exception 'Sign in first' using errcode='42501';
  end if;

  select country_id into v_country
  from public.country_accounts
  where user_id = v_user
    and status = 'active';

  if v_country is null then
    raise exception 'No active country account' using errcode='42501';
  end if;

  delete from public.country_edition_identities
  where country_id = v_country
    and edition_id = _edition_id;

  select name, short_code, flag_image, region
    into v_name, v_short_code, v_flag, v_region
  from public.countries
  where id = v_country;

  update public.contest_entities
  set display_name = v_name,
      abbreviation = v_short_code,
      flag_image = v_flag,
      region = v_region,
      historical_identity_override = false,
      updated_at = now()
  where edition_id = _edition_id
    and country_id = v_country
    and entity_type = 'global';

  return true;
end;
$$;

revoke all on function public.clear_owned_country_edition_identity(uuid) from public, anon;
grant execute on function public.clear_owned_country_edition_identity(uuid) to authenticated;

create or replace function public.public_country_identity_history(_country_id uuid)
returns table (
  edition_id uuid,
  edition_number integer,
  edition_name text,
  display_name text,
  flag_image text
)
language sql
stable
security definer
set search_path to 'public','pg_temp'
as $$
  select
    cei.edition_id,
    e.edition_number,
    e.name,
    cei.display_name,
    cei.flag_image
  from public.country_edition_identities cei
  join public.editions e on e.id = cei.edition_id
  where cei.country_id = _country_id
    and e.published = true
  order by e.edition_number asc nulls last, e.name asc
$$;

revoke all on function public.public_country_identity_history(uuid) from public;
grant execute on function public.public_country_identity_history(uuid) to anon, authenticated, service_role;

-- Current-country edits must continue propagating to ordinary edition entities,
-- while explicit historical snapshots stay frozen for their selected editions.
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
  select ca.country_id into v_country_id from public.country_accounts ca where ca.user_id = auth.uid();
  if v_country_id is null then raise exception 'This account does not own a country.' using errcode = '42501'; end if;
  if v_name is null or length(v_name) > 80 then raise exception 'Country name must be between 1 and 80 characters.' using errcode = '22023'; end if;
  if v_accent !~ '^#[0-9A-Fa-f]{6}$' then raise exception 'Accent colour must use a six-digit hex value.' using errcode = '22023'; end if;

  update public.countries
  set name=v_name,native_name=v_native_name,region=v_region,description=v_description,accent_color=v_accent,flag_image=v_flag
  where id=v_country_id;

  update public.contest_entities
  set display_name=v_name,flag_image=v_flag,region=v_region,updated_at=now()
  where country_id=v_country_id
    and entity_type='global'
    and historical_identity_override = false;

  update public.voters
  set name=v_name,flag_image=v_flag,accent_color=v_accent
  where country_id=v_country_id;

  select to_jsonb(c) into v_result from public.countries c where c.id=v_country_id;
  return v_result;
end;
$$;

revoke all on function public.update_owned_country_identity(text,text,text,text,text,text) from public;
grant execute on function public.update_owned_country_identity(text,text,text,text,text,text) to authenticated, service_role;

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

revoke all on function public.admin_update_country_identity(uuid,text,text,text,text,text,text) from public;
grant execute on function public.admin_update_country_identity(uuid,text,text,text,text,text,text) to authenticated, service_role;

commit;
