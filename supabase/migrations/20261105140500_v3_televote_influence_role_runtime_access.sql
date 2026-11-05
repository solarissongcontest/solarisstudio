begin;

-- Main owns authenticated Organizer influence writes through voting.manage.
-- The isolated S14 materializer uses its local service_role client to rebuild
-- disposable evidence. Extend only that caller's required table privileges.
select public.v3_register_migration_contract(
  'v3.s14.televote-influence-service-role-runtime-access-v2',
  1, 'forward_fix_only', false, null,
  'Allow the local/server service role to rebuild Televote influence evidence without changing the existing authenticated voting.manage policy.'
);

alter table televoting.round_influence_results enable row level security;
revoke all on table televoting.round_influence_results from public, anon;
revoke update, truncate, references, trigger
  on table televoting.round_influence_results from service_role;
grant select, insert, delete
  on table televoting.round_influence_results to service_role;

do $assert$
declare
  v_privilege text;
begin
  if not (select relrowsecurity from pg_class where oid='televoting.round_influence_results'::regclass) then
    raise exception 'Influence evidence RLS must remain enabled';
  end if;
  foreach v_privilege in array array['SELECT', 'INSERT', 'DELETE'] loop
    if not has_table_privilege('service_role', 'televoting.round_influence_results', v_privilege) then
      raise exception 'Missing server evidence privilege: %', v_privilege;
    end if;
  end loop;
  foreach v_privilege in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE'] loop
    if not has_table_privilege('authenticated', 'televoting.round_influence_results', v_privilege) then
      raise exception 'Existing Organizer privilege unexpectedly absent: %', v_privilege;
    end if;
  end loop;
  if has_table_privilege('service_role', 'televoting.round_influence_results', 'UPDATE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'Unexpected server evidence mutation privilege';
  end if;
  if has_table_privilege('anon', 'televoting.round_influence_results', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'Anonymous influence evidence access must remain denied';
  end if;
  if not exists (
    select 1
    from pg_policy p
    where p.polrelid = 'televoting.round_influence_results'::regclass
      and p.polname = 'televoting organizer full access'
  ) then
    raise exception 'Organizer voting.manage RLS policy is missing';
  end if;
end
$assert$;

notify pgrst, 'reload schema';
commit;
