begin;

create or replace function private.studio2_guard_jury_requirement()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_assigned integer;
begin
  select count(*)::integer
  into v_assigned
  from public.studio2_jury_members jm
  where jm.edition_id = new.edition_id
    and jm.country_id = new.country_id
    and jm.status = 'assigned';

  if new.jury_members_required < v_assigned then
    raise exception 'Jury requirement cannot be lower than the % currently assigned members', v_assigned
      using errcode = '23514';
  end if;

  if (tg_op = 'INSERT' or new.jury_members_required is distinct from old.jury_members_required)
     and exists (
       select 1
       from public.jury_ballot_submissions jbs
       where jbs.edition_id = new.edition_id
         and jbs.voter_country_id = new.country_id
         and jbs.status = 'submitted'
     ) then
    raise exception 'Jury requirement is frozen after ballot submission' using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger studio2_delegation_settings_guard_requirement
before insert or update of jury_members_required on public.studio2_delegation_settings
for each row execute function private.studio2_guard_jury_requirement();

create or replace function private.studio2_guard_jury_member_user_link()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_service boolean := coalesce(auth.role(), '') = 'service_role';
begin
  if new.member_user_id is not null
     and not v_is_service
     and not public.has_role(v_actor, 'organizer'::public.app_role) then
    raise exception 'Only organizers may link a jury roster member to an authenticated user'
      using errcode = '42501';
  end if;

  return new;
end
$$;

create trigger studio2_jury_members_guard_user_link
before insert or update of member_user_id on public.studio2_jury_members
for each row execute function private.studio2_guard_jury_member_user_link();

revoke all on function private.studio2_guard_jury_requirement()
  from public, anon, authenticated;
revoke all on function private.studio2_guard_jury_member_user_link()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
