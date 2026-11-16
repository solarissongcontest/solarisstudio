-- S16: direct API-role table mutation is not a publication authority.
-- Forward-only. The authenticated Organizer and scheduled service_role callers
-- retain their governed SECURITY DEFINER RPCs and existing SELECT/RLS semantics.
-- Never apply to hosted production without a separate migration approval.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '60s';

do $s16_publication_preflight$
declare
  v_identity text;
  v_proc pg_proc%rowtype;
  v_relation text;
  v_table pg_class%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
  then
    raise exception 'S16 publication privilege cutover requires reviewed PostgreSQL 17 migration owner' using errcode = '55000';
  end if;

  foreach v_identity in array array[
    'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)',
    'public.studio2_publish_due_show_publications()'
  ] loop
    select * into v_proc from pg_proc where oid = to_regprocedure(v_identity);
    if v_proc.oid is null or not v_proc.prosecdef
       or pg_get_userbyid(v_proc.proowner) <> 'postgres'
       or v_proc.proconfig is distinct from array['search_path=pg_catalog, public, private']::text[]
    then
      raise exception 'S16 publication canonical owner/function drift: %', v_identity using errcode = '55000';
    end if;
  end loop;

  if not has_function_privilege('authenticated',
      'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)', 'EXECUTE')
     or has_function_privilege('anon',
      'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)', 'EXECUTE')
     or not has_function_privilege('service_role',
      'public.studio2_publish_due_show_publications()', 'EXECUTE')
     or has_function_privilege('anon',
      'public.studio2_publish_due_show_publications()', 'EXECUTE')
     or has_function_privilege('authenticated',
      'public.studio2_publish_due_show_publications()', 'EXECUTE')
  then
    raise exception 'S16 publication canonical RPC execution privilege drift' using errcode = '55000';
  end if;

  foreach v_relation in array array[
    'public.studio2_show_publication_controls',
    'public.studio2_show_publication_executions'
  ] loop
    select * into v_table from pg_class where oid = to_regclass(v_relation);
    if v_table.oid is null or v_table.relkind <> 'r'
       or pg_get_userbyid(v_table.relowner) <> 'postgres'
       or not v_table.relrowsecurity
       or exists (select 1 from pg_attribute a
                  where a.attrelid = v_table.oid and a.attnum > 0
                    and not a.attisdropped and a.attacl is not null)
    then
      raise exception 'S16 unqualified publication table/column privileges: %', v_relation using errcode = '55000';
    end if;
  end loop;
end
$s16_publication_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.publication-direct-table-retirement', 1, 'forward_fix_only',
  false, null,
  'Retire API and service-role direct publication control/execution table writes, retain canonical owner-executed commands'
);

-- Intentionally preserve SELECT. Granting service_role ALL in the historical
-- publication table creation no longer licenses competing direct mutation.
revoke insert, update, delete, truncate, references, trigger, maintain on table
  public.studio2_show_publication_controls,
  public.studio2_show_publication_executions
from public, anon, authenticated, service_role;

do $s16_publication_postcheck$
declare
  v_relation text;
  v_role text;
  v_privilege text;
begin
  foreach v_relation in array array[
    'public.studio2_show_publication_controls',
    'public.studio2_show_publication_executions'
  ] loop
    foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
      foreach v_privilege in array array[
        'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN'
      ] loop
        if has_table_privilege(v_role, v_relation, v_privilege) then
          raise exception 'S16 publication direct privilege survives: % % %',
            v_role, v_relation, v_privilege using errcode = '42501';
        end if;
      end loop;
      if has_any_column_privilege(v_role, v_relation, 'INSERT')
         or has_any_column_privilege(v_role, v_relation, 'UPDATE')
      then
        raise exception 'S16 publication column DML survives: % %',
          v_role, v_relation using errcode = '42501';
      end if;
      if not has_table_privilege('service_role', v_relation, 'SELECT') then
        raise exception 'S16 publication service read contract changed: %', v_relation using errcode = '55000';
      end if;
    end loop;
  end loop;
  if not has_function_privilege('authenticated',
       'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)', 'EXECUTE')
    or not has_function_privilege('service_role',
       'public.studio2_publish_due_show_publications()', 'EXECUTE')
  then
    raise exception 'S16 canonical publication RPC grant lost' using errcode = '55000';
  end if;
end
$s16_publication_postcheck$;

notify pgrst, 'reload schema';
commit;
