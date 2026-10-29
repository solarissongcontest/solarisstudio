begin;

-- S16 Jury transport boundary.
-- API/service transport roles may read according to publication/authorization
-- policy, but they are not independent Jury mutation authorities.
revoke insert, update, delete, truncate
  on table public.jury_voting_windows
  from authenticated, service_role;
revoke insert, update, delete, truncate
  on table public.jury_ballot_submissions
  from authenticated, service_role;
revoke insert, update, delete, truncate
  on table public.jury_votes
  from authenticated, service_role;
revoke insert, update, delete, truncate
  on table public.studio2_jury_window_versions
  from authenticated, service_role;

-- The accepted-ballot helper is an implementation primitive behind
-- v3_submit_jury_ballot. Direct execution skips the V3 operation identity,
-- request fingerprint, receipt and uncertain-outcome reconciliation contract.
alter function public.submit_country_jury_ballot(uuid, jsonb, uuid)
  owner to postgres;
alter function public.submit_country_jury_ballot(uuid, jsonb, uuid)
  set search_path = pg_catalog, public, televoting, pg_temp;
revoke all on function public.submit_country_jury_ballot(uuid, jsonb, uuid)
  from public, anon, authenticated, service_role;

-- V3 Jury draft/operation storage is reached only through SECURITY DEFINER
-- commands. service_role does not need raw table mutation to transport those
-- commands.
revoke all on table private.v3_jury_drafts from service_role;
revoke all on table private.v3_jury_operations from service_role;

do $proof$
declare
  v_table text;
begin
  foreach v_table in array array[
    'public.jury_voting_windows',
    'public.jury_ballot_submissions',
    'public.jury_votes',
    'public.studio2_jury_window_versions'
  ]
  loop
    if has_table_privilege('authenticated', v_table, 'INSERT')
       or has_table_privilege('authenticated', v_table, 'UPDATE')
       or has_table_privilege('authenticated', v_table, 'DELETE')
       or has_table_privilege('authenticated', v_table, 'TRUNCATE')
       or has_table_privilege('service_role', v_table, 'INSERT')
       or has_table_privilege('service_role', v_table, 'UPDATE')
       or has_table_privilege('service_role', v_table, 'DELETE')
       or has_table_privilege('service_role', v_table, 'TRUNCATE') then
      raise exception 'S16: raw Jury DML remains on %', v_table;
    end if;
  end loop;

  if has_function_privilege(
       'authenticated',
       'public.submit_country_jury_ballot(uuid,jsonb,uuid)',
       'EXECUTE'
     )
     or has_function_privilege(
       'service_role',
       'public.submit_country_jury_ballot(uuid,jsonb,uuid)',
       'EXECUTE'
     ) then
    raise exception 'S16: lower-level Jury ballot writer remains externally executable';
  end if;

  if has_table_privilege('service_role', 'private.v3_jury_operations', 'INSERT')
     or has_table_privilege('service_role', 'private.v3_jury_operations', 'UPDATE')
     or has_table_privilege('service_role', 'private.v3_jury_operations', 'DELETE')
     or has_table_privilege('service_role', 'private.v3_jury_drafts', 'INSERT')
     or has_table_privilege('service_role', 'private.v3_jury_drafts', 'UPDATE')
     or has_table_privilege('service_role', 'private.v3_jury_drafts', 'DELETE') then
    raise exception 'S16: service_role retains raw Jury private-storage mutation';
  end if;
end;
$proof$;

commit;
