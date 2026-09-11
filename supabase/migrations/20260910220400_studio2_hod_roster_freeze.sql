begin;

-- A submitted jury ballot freezes the delegation roster. This is enforced in
-- the database so a stale or malicious client cannot change juror identity after
-- the authoritative ballot has been accepted.
create or replace function private.studio2_guard_jury_roster_after_ballot()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if exists (
    select 1
    from public.jury_ballot_submissions jbs
    where jbs.edition_id = new.edition_id
      and jbs.voter_country_id = new.country_id
      and jbs.status = 'submitted'
  ) then
    raise exception 'Delegation jury roster is frozen after ballot submission'
      using errcode = '23514';
  end if;

  return new;
end
$$;

create trigger studio2_jury_members_freeze_after_ballot
before insert or update on public.studio2_jury_members
for each row execute function private.studio2_guard_jury_roster_after_ballot();

revoke all on function private.studio2_guard_jury_roster_after_ballot()
  from public, anon, authenticated;

notify pgrst, 'reload schema';

commit;
