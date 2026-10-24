-- V3 S14: restore the runtime table privileges required beneath the canonical
-- voting.manage RLS policy for Organizer Televote round bindings.
--
-- The Permission Engine remains the authorization authority. PostgreSQL table
-- privileges are only the prerequisite that lets authenticated requests reach
-- the existing RLS policy; this migration does not grant anonymous access and
-- does not bypass RLS.

grant select, insert, update, delete
on table public.televoting_round_bindings
to authenticated;

do $$
declare
  v_rls_enabled boolean;
begin
  select c.relrowsecurity
    into v_rls_enabled
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname = 'televoting_round_bindings';

  if coalesce(v_rls_enabled, false) is not true then
    raise exception 'televoting_round_bindings must remain protected by RLS';
  end if;

  if not has_table_privilege('authenticated', 'public.televoting_round_bindings', 'SELECT') then
    raise exception 'authenticated SELECT privilege missing on televoting_round_bindings';
  end if;
  if not has_table_privilege('authenticated', 'public.televoting_round_bindings', 'INSERT') then
    raise exception 'authenticated INSERT privilege missing on televoting_round_bindings';
  end if;
  if not has_table_privilege('authenticated', 'public.televoting_round_bindings', 'UPDATE') then
    raise exception 'authenticated UPDATE privilege missing on televoting_round_bindings';
  end if;
  if not has_table_privilege('authenticated', 'public.televoting_round_bindings', 'DELETE') then
    raise exception 'authenticated DELETE privilege missing on televoting_round_bindings';
  end if;
end
$$;
