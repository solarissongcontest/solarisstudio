begin;

-- These organizer-only RPCs were defined in an earlier migration but are
-- missing from the current production database. The country_accounts rows are
-- intact; without the RPCs the UI incorrectly falls back to an empty
-- "schema unavailable" state and reports every country as unclaimed.
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

notify pgrst, 'reload schema';

commit;
