begin;

-- Country accounts use the delegation's Instagram handle as the Solaris Studio
-- username. A recovery email is optional and stays in Supabase Auth rather than
-- being exposed from the public country-account table.
alter table public.country_accounts
  add column if not exists instagram_username text,
  add column if not exists display_name text;

create unique index if not exists country_accounts_instagram_username_lower_uidx
  on public.country_accounts (lower(instagram_username))
  where instagram_username is not null;

-- New country signups must carry the username and display name in auth metadata.
-- Existing country accounts remain valid and can continue to sign in by email.
create or replace function public.claim_country_from_signup()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_country_id uuid;
  v_country_text text;
  v_instagram_username text;
  v_display_name text;
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

  v_instagram_username := lower(regexp_replace(btrim(coalesce(new.raw_user_meta_data ->> 'instagram_username', '')), '^@+', ''));
  v_display_name := nullif(btrim(new.raw_user_meta_data ->> 'display_name'), '');

  if v_instagram_username = ''
     or length(v_instagram_username) > 30
     or v_instagram_username !~ '^[a-z0-9._]+$' then
    raise exception 'A valid Instagram username is required.' using errcode = '22023';
  end if;

  if v_display_name is null or length(v_display_name) > 80 then
    raise exception 'A name or nickname is required.' using errcode = '22023';
  end if;

  begin
    insert into public.country_accounts (user_id, country_id, instagram_username, display_name)
    values (new.id, v_country_id, v_instagram_username, v_display_name);
  exception
    when unique_violation then
      if exists (
        select 1 from public.country_accounts ca
        where lower(ca.instagram_username) = v_instagram_username
      ) then
        raise exception 'That Instagram username already has a Solaris Studio account.' using errcode = '23505';
      end if;
      raise exception 'That country already has an account.' using errcode = '23505';
  end;

  return new;
end;
$$;

-- Do not show the internal placeholder email used by country accounts that chose
-- not to add a recovery address.
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

revoke all on function public.admin_country_accounts() from public, anon;
grant execute on function public.admin_country_accounts() to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
