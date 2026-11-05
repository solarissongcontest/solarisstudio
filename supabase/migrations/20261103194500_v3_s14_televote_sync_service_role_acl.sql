begin;

select public.v3_register_migration_contract(
  'v3.results.televote-sync-service-role-bindings',
  1,
  'forward_fix_only',
  false,
  null,
  'Restore minimal server-only access to linked Televote bindings during published result synchronization.'
);

-- The authenticated Organizer path remains governed by voting.manage RLS.
-- The server-side result sync uses a service-role client and must read the
-- binding and freeze it after successfully importing the published source.
grant select, update
on table public.televoting_round_bindings
to service_role;

do $$
begin
  if not (
    select relrowsecurity
    from pg_class
    where oid = 'public.televoting_round_bindings'::regclass
  ) then
    raise exception 'Televote bindings RLS must remain enabled';
  end if;

  if not has_table_privilege(
    'service_role', 'public.televoting_round_bindings', 'SELECT'
  ) or not has_table_privilege(
    'service_role', 'public.televoting_round_bindings', 'UPDATE'
  ) then
    raise exception 'Server result-sync binding privileges are incomplete';
  end if;

  if has_table_privilege(
    'anon', 'public.televoting_round_bindings', 'UPDATE'
  ) then
    raise exception 'Anonymous users must not update Televote bindings';
  end if;
end;
$$;

commit;
