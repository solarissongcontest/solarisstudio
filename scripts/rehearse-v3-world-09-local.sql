\set ON_ERROR_STOP on
-- DOMAIN TEST: no data modifications. Run only via the loopback-validated Node
-- wrapper, against a disposable local Supabase/PostgreSQL with all migrations.
begin;
set local transaction read only;

do $checks$
declare
  table_name text;
  table_ref text;
  rel oid;
  expected_tables text[] := array[
    'world_domestic_parties',
    'world_domestic_elections',
    'world_domestic_record_revisions',
    'world_history_events',
    'world_domestic_legislatures',
    'world_domestic_chambers',
    'world_domestic_structure_revisions',
    'world_lore_people',
    'world_domestic_offices',
    'world_domestic_office_terms',
    'world_domestic_official_revisions',
    'world_domestic_measures',
    'world_domestic_measure_versions',
    'world_domestic_measure_transitions',
    'world_domestic_laws'
  ];
  function_signature text;
  expected_functions text[] := array[
    'world_write_domestic_canon_v1(uuid,text,uuid,jsonb,bigint,uuid,text)',
    'world_write_domestic_structure_v1(uuid,text,uuid,jsonb,bigint,uuid,text)',
    'world_write_domestic_official_v1(uuid,text,uuid,jsonb,bigint,uuid,text)',
    'world_write_domestic_measure_v1(uuid,text,uuid,jsonb,bigint,uuid,text)'
  ];
  projection_name text;
begin
  foreach table_name in array expected_tables loop
    table_ref := format('public.%I',table_name);
    rel := to_regclass(table_ref);
    if rel is null then
      raise exception 'WORLD09_SCHEMA_MISSING: %',table_ref;
    end if;
    if not exists (select 1 from pg_class c where c.oid=rel and c.relrowsecurity) then
      raise exception 'WORLD09_RLS_DISABLED: %',table_ref;
    end if;
    if has_table_privilege('anon',table_ref,'INSERT')
       or has_table_privilege('anon',table_ref,'UPDATE')
       or has_table_privilege('anon',table_ref,'DELETE')
       or has_table_privilege('authenticated',table_ref,'INSERT')
       or has_table_privilege('authenticated',table_ref,'UPDATE')
       or has_table_privilege('authenticated',table_ref,'DELETE')
       or has_table_privilege('service_role',table_ref,'INSERT')
       or has_table_privilege('service_role',table_ref,'UPDATE')
       or has_table_privilege('service_role',table_ref,'DELETE') then
      raise exception 'WORLD09_DIRECT_MUTATION_NOT_REVOKED: %',table_ref;
    end if;
  end loop;
  foreach function_signature in array expected_functions loop
    if to_regprocedure('public.'||function_signature) is null then
      raise exception 'WORLD09_GOVERNED_COMMAND_MISSING: %',function_signature;
    end if;
    if not (select p.prosecdef from pg_proc p
      where p.oid=to_regprocedure('public.'||function_signature)) then
      raise exception 'WORLD09_COMMAND_NOT_SECURITY_DEFINER: %',function_signature;
    end if;
    if has_function_privilege('anon','public.'||function_signature,'EXECUTE') then
      raise exception 'WORLD09_ANONYMOUS_COMMAND_EXECUTION: %',function_signature;
    end if;
  end loop;
  foreach projection_name in array array[
      'world_domestic_country_v1(text)',
      'world_domestic_legislature_v1(text)',
      'world_domestic_officials_v1(text)',
      'world_history_timeline_v1(integer,text)',
      'world_domestic_laws_v1(text)',
      'world_domestic_measure_detail_v1(uuid)'
    ] loop
    if to_regprocedure('public.'||projection_name) is null then
      raise exception 'WORLD09_PUBLIC_PROJECTION_MISSING: %',projection_name;
    end if;
    if not has_function_privilege('anon','public.'||projection_name,'EXECUTE') then
      raise exception 'WORLD09_PUBLIC_PROJECTION_NOT_READABLE: %',projection_name;
    end if;
  end loop;
  if not exists(select 1 from pg_indexes where schemaname='public'
    and indexname='world_domestic_office_one_open_uidx') then
    raise exception 'WORLD09_TERM_UNIQUENESS_MISSING';
  end if;
  raise notice 'WORLD09 local read-only schema and privileges passed';
end
$checks$;

rollback;
