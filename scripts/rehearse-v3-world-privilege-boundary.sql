-- TG19: read-only, local/disposable Supabase schema audit.
-- A catalog check, not a substitute for real actor/RLS row-behavior rehearsals.
-- Refuse to pass when World schema has not been installed in the local stack.
begin;
set transaction read only;

do $audit$
declare
  world_table record;
  actor_name text;
  privilege_name text;
  world_table_count integer := 0;
  violations text[] := array[]::text[];
begin
  if not exists (select 1 from pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_roles where rolname = 'authenticated') then
    raise exception 'TG19_WORLD_PRIVILEGES_MISSING_LOCAL_SUPABASE_ROLES';
  end if;

  for world_table in
    select c.oid, c.relname, c.relrowsecurity
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and left(c.relname, 6) = 'world_'
       and c.relkind in ('r', 'p') -- ordinary/partitioned persistent tables
     order by c.relname
  loop
    world_table_count := world_table_count + 1;
    if not world_table.relrowsecurity then
      violations := array_append(violations,
        format('RLS_DISABLED public.%I', world_table.relname));
    end if;

    -- RLS alone does not make direct browser DML a canonical command.
    -- Future TG migrations must use authorized server operations instead.
    foreach actor_name in array array['anon', 'authenticated'] loop
      foreach privilege_name in array array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE'] loop
        if pg_catalog.has_table_privilege(actor_name::name, world_table.oid, privilege_name) then
          violations := array_append(violations,
            format('RAW_%s_GRANTED role=%s table=public.%I', privilege_name,
              actor_name, world_table.relname));
        end if;
      end loop;
    end loop;
  end loop;

  if world_table_count = 0 then
    raise exception 'TG19_WORLD_PRIVILEGES_NO_WORLD_TABLES: migrations not installed';
  end if;
  if cardinality(violations) > 0 then
    raise exception 'TG19_WORLD_PRIVILEGES_FAILED (% tables audited): %',
      world_table_count, array_to_string(violations, '; ');
  end if;
  raise notice 'TG19_WORLD_PRIVILEGES_PASSED: % persistent World tables; RLS enabled and no browser-role direct DML',
    world_table_count;
end
$audit$;
rollback;
