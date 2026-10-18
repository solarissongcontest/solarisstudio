begin;

-- Canonical Confirmation -> Solaris synchronization runs only through the
-- server-side Supabase service-role client. RLS bypass does not imply table
-- privileges, so a clean migration replay must explicitly restore the narrow
-- direct privileges used by syncConfirmationSubmissionToSolarisInternal().
--
-- Keep browser roles unchanged here. Participant/Organizer authority remains
-- behind the existing RPC/RLS boundaries.

grant select on table
  public.submissions,
  public.internal_entries,
  public.national_finals,
  public.national_final_entries,
  public.editions,
  public.countries
  to service_role;

grant select, insert, update on table
  public.entries,
  public.participants
  to service_role;

grant select, insert on table
  public.contest_entities
  to service_role;

grant select, insert, update, delete on table
  public.integration_links
  to service_role;

grant insert, update on table
  public.integration_events
  to service_role;

-- Fail during migration replay, not halfway through the S14 lifecycle, if a
-- future privilege hardening migration accidentally removes one of the direct
-- capabilities required by the canonical server sync.
do $$
declare
  v_requirement record;
begin
  for v_requirement in
    select *
    from (values
      ('public.submissions', 'SELECT'),
      ('public.internal_entries', 'SELECT'),
      ('public.national_finals', 'SELECT'),
      ('public.national_final_entries', 'SELECT'),
      ('public.editions', 'SELECT'),
      ('public.countries', 'SELECT'),
      ('public.entries', 'SELECT'),
      ('public.entries', 'INSERT'),
      ('public.entries', 'UPDATE'),
      ('public.participants', 'SELECT'),
      ('public.participants', 'INSERT'),
      ('public.participants', 'UPDATE'),
      ('public.contest_entities', 'SELECT'),
      ('public.contest_entities', 'INSERT'),
      ('public.integration_links', 'SELECT'),
      ('public.integration_links', 'INSERT'),
      ('public.integration_links', 'UPDATE'),
      ('public.integration_links', 'DELETE'),
      ('public.integration_events', 'INSERT'),
      ('public.integration_events', 'UPDATE')
    ) as required_privilege(table_name, privilege_name)
  loop
    if not has_table_privilege(
      'service_role',
      v_requirement.table_name,
      v_requirement.privilege_name
    ) then
      raise exception
        'Canonical Confirmation sync requires service_role % on %',
        v_requirement.privilege_name,
        v_requirement.table_name;
    end if;
  end loop;
end;
$$;

commit;
