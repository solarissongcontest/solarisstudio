begin;

-- Trust & Integrity uses cryptographically random recovery secrets and SHA-256
-- digests. Keep the extension in Supabase's conventional `extensions` schema so
-- SECURITY DEFINER functions can use an explicit, narrow search_path.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- `create extension if not exists` does not relocate an already-installed
-- extension. Normalize the schema so the following integrity migration can
-- safely qualify pgcrypto functions as `extensions.*` on older projects too.
do $$
declare
  v_schema text;
begin
  select n.nspname
    into v_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'pgcrypto';

  if v_schema is distinct from 'extensions' then
    alter extension pgcrypto set schema extensions;
  end if;
end;
$$;

commit;
