begin;

-- Supabase projects can grant EXECUTE directly to API roles through default
-- privileges. REVOKE ... FROM public does not remove those direct grants.
-- Keep the deliberately anonymous upload gate callable, while removing anon
-- access from organizer, reporter and internal Rules/Integrity helpers.
do $$
declare
  target record;
begin
  for target in
    select
      n.nspname as schema_name,
      p.proname as function_name,
      pg_get_function_identity_arguments(p.oid) as identity_arguments
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        p.proname like 'admin\_%' escape '\'
        or p.proname like 'reporter\_%' escape '\'
        or p.proname like 'create\_protected\_%' escape '\'
        or p.proname like 'finalize\_protected\_%' escape '\'
        or p.proname like 'integrity\_%' escape '\'
        or p.proname like 'rulebook\_%' escape '\'
      )
      and p.proname <> 'integrity_can_upload_evidence'
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      target.schema_name,
      target.function_name,
      target.identity_arguments
    );
  end loop;
end
$$;

commit;
