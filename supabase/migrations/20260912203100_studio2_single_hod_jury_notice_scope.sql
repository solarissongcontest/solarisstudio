begin;

create or replace function private.studio2_user_can_receive_notice_v2(
  p_user_id uuid,
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[],
  p_audience_group text default null
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country_id uuid;
  v_selected_person_id uuid;
  v_account_person_id uuid;
begin
  if p_audience <> 'jurors' then
    return private.studio2_user_can_receive_notice_v2_legacy_roster(
      p_user_id,
      p_edition_id,
      p_audience,
      p_country_ids,
      p_audience_group
    );
  end if;

  if p_user_id is null then
    return false;
  end if;

  if public.has_role(p_user_id, 'organizer'::public.app_role) then
    return true;
  end if;

  select ca.country_id
  into v_country_id
  from public.country_accounts ca
  where ca.user_id = p_user_id
    and ca.status = 'active'
  limit 1;

  if v_country_id is null then
    return false;
  end if;

  -- If a caller also supplied an explicit country scope, never broaden it just
  -- because the audience happens to be jurors.
  if coalesce(cardinality(p_country_ids), 0) > 0
     and not (v_country_id = any(p_country_ids)) then
    return false;
  end if;

  -- An unscoped jury communication targets current country HOD accounts.
  if p_edition_id is null then
    return true;
  end if;

  select a.person_id
  into v_selected_person_id
  from public.delegation_hod_assignments a
  where a.edition_id = p_edition_id
    and a.country_id = v_country_id
    and a.channel in ('jury', 'delegation')
  order by
    case when a.channel = 'jury' then 0 else 1 end,
    a.updated_at desc,
    a.id
  limit 1;

  if v_selected_person_id is null then
    return false;
  end if;

  select p.id
  into v_account_person_id
  from public.delegation_people p
  where p.identity_key = 'account:' || p_user_id::text
  limit 1;

  return v_account_person_id is not null
    and v_selected_person_id = v_account_person_id;
end
$$;

revoke all on function private.studio2_user_can_receive_notice_v2(uuid, uuid, text, uuid[], text)
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
