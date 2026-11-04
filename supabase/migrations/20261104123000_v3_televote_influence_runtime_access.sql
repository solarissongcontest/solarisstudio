begin;

-- This table was created after the schema-wide grants and omitted from the
-- Permission Engine v2 result-surface cutover. Canonical server clients carry
-- the current user's token, so service_role alone does not repair conversion.
alter table televoting.round_influence_results enable row level security;
revoke all on table televoting.round_influence_results from public, anon, authenticated, service_role;
grant select, insert, delete on table televoting.round_influence_results to authenticated, service_role;

create policy "televoting organizer full access"
on televoting.round_influence_results for all to authenticated
using (public.studio2_access_allowed('voting.manage', null, false))
with check (public.studio2_access_allowed('voting.manage', null, false));

select public.v3_register_migration_contract(
  'v3.s14.televote-influence-runtime-access-v1',
  1, 'forward_fix_only', false, null,
  'Repair omitted Organizer influence evidence ACL under canonical global voting.manage; grant only SELECT/INSERT/DELETE to authenticated and service_role, deny anonymous access, preserve RLS and historical migration bytes.'
);

do $assert$
declare
  v_role text;
  v_privilege text;
begin
  foreach v_role in array array['authenticated', 'service_role'] loop
    foreach v_privilege in array array['SELECT', 'INSERT', 'DELETE'] loop
      if not has_table_privilege(v_role, 'televoting.round_influence_results', v_privilege) then
        raise exception 'Missing influence evidence privilege: % %', v_role, v_privilege;
      end if;
    end loop;
    if has_table_privilege(v_role, 'televoting.round_influence_results', 'UPDATE,TRUNCATE,REFERENCES,TRIGGER') then
      raise exception 'Unexpected influence evidence privilege for %', v_role;
    end if;
  end loop;
  if has_table_privilege('anon', 'televoting.round_influence_results', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') then
    raise exception 'Anonymous influence evidence access must remain denied';
  end if;
  if not (select relrowsecurity from pg_class where oid='televoting.round_influence_results'::regclass) then
    raise exception 'Influence evidence RLS must remain enabled';
  end if;
end
$assert$;

commit;
