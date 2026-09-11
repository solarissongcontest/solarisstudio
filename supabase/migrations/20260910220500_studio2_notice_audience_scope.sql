begin;

-- Tighten delegation notice visibility so an active country account does not
-- automatically gain access to every edition-scoped HOD notice. For an edition
-- notice the user's country must actually be represented by a participant or
-- canonical entry in that edition.
create or replace function private.studio2_user_can_receive_notice(
  p_user_id uuid,
  p_edition_id uuid,
  p_audience text,
  p_country_ids uuid[]
)
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_country_id uuid;
begin
  if p_user_id is null then
    return false;
  end if;

  if public.has_role(p_user_id, 'organizer'::public.app_role) then
    return true;
  end if;

  if p_audience in ('all_delegations', 'hods') then
    return exists (
      select 1
      from public.country_accounts ca
      where ca.user_id = p_user_id
        and ca.status = 'active'
        and (
          p_edition_id is null
          or exists (
            select 1
            from public.participants p
            where p.edition_id = p_edition_id
              and p.country_id = ca.country_id
          )
          or exists (
            select 1
            from public.entries e
            where e.edition_id = p_edition_id
              and e.country_id = ca.country_id
          )
        )
    );
  end if;

  if p_audience = 'specific_countries' then
    foreach v_country_id in array coalesce(p_country_ids, '{}'::uuid[])
    loop
      if public.owns_country(p_user_id, v_country_id) then
        return true;
      end if;
    end loop;
    return false;
  end if;

  if p_audience = 'jurors' then
    return exists (
      select 1
      from public.studio2_jury_members jm
      where jm.member_user_id = p_user_id
        and jm.status = 'assigned'
        and (p_edition_id is null or jm.edition_id = p_edition_id)
    );
  end if;

  if p_audience = 'staff' then
    return private.studio2_user_has_capability(p_user_id, 'edition.read', p_edition_id)
      or private.studio2_user_has_capability(p_user_id, 'edition.manage', p_edition_id);
  end if;

  return false;
end
$$;

revoke all on function private.studio2_user_can_receive_notice(uuid, uuid, text, uuid[])
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
