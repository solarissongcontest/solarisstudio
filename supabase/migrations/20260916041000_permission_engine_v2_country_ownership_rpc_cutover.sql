begin;

-- Permission Engine v2 cutover batch 9.
--
-- Country claiming is a negative staff check rather than a protected admin
-- action. Preserve its exact legacy meaning before authoritative cutover, then
-- translate the staff boundary to global delegation.manage afterwards.

create or replace function private.studio2_country_claim_blocked(p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
begin
  if p_user_id is null then
    return false;
  end if;

  if private.studio2_permission_engine_authoritative() then
    return private.studio2_user_has_capability(p_user_id, 'delegation.manage', null);
  end if;

  return public.has_role(p_user_id, 'organizer'::public.app_role);
end;
$$;

revoke all on function private.studio2_country_claim_blocked(uuid) from public, anon, authenticated;
grant execute on function private.studio2_country_claim_blocked(uuid) to service_role;

create or replace function public.claim_country_account(_country_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required.' using errcode = '42501';
  end if;

  if private.studio2_country_claim_blocked(v_user_id) then
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

create or replace function public.owns_country(_user_id uuid, _country_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, private
as $$
  select
    _user_id is not null
    and _country_id is not null
    and (
      _user_id = auth.uid()
      or public.studio2_access_allowed('delegation.read', null, true)
    )
    and exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = _user_id
        and ca.country_id = _country_id
    )
$$;

create or replace function public.reorder_country_profile_sections(
  _country_id uuid,
  _section_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_id uuid;
  v_position integer := 0;
begin
  if not public.owns_country(_country_id)
     and not public.studio2_access_allowed('delegation.manage', null, true) then
    raise exception 'Country editing access required.' using errcode = '42501';
  end if;

  if coalesce(array_length(_section_ids, 1), 0) <> (
    select count(*)::integer
    from public.country_profile_sections
    where country_id = _country_id
  ) then
    raise exception 'Section order must contain every country section exactly once.' using errcode = '22023';
  end if;

  if (
    select count(distinct value)::integer
    from unnest(_section_ids) as value
  ) <> coalesce(array_length(_section_ids, 1), 0) then
    raise exception 'Section order contains duplicates.' using errcode = '22023';
  end if;

  foreach v_id in array _section_ids loop
    if not exists (
      select 1
      from public.country_profile_sections
      where id = v_id and country_id = _country_id
    ) then
      raise exception 'Section does not belong to this country.' using errcode = '22023';
    end if;

    update public.country_profile_sections
    set sort_order = v_position
    where id = v_id and country_id = _country_id;

    v_position := v_position + 1;
  end loop;
end;
$$;

revoke all on function public.claim_country_account(uuid) from public, anon;
grant execute on function public.claim_country_account(uuid) to authenticated, service_role;

revoke all on function public.owns_country(uuid, uuid) from public, anon;
grant execute on function public.owns_country(uuid, uuid) to authenticated, service_role;

revoke all on function public.reorder_country_profile_sections(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_country_profile_sections(uuid, uuid[]) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
