-- S16 P13: restrict the canonical edition runtime table to owner-executed commands.
-- Preserve the V3 transition wrapper, private CAS/receipt implementation, archive
-- gate and edition-seed trigger. Source only: NEVER run against hosted without
-- separate explicit owner approval and production-frontier qualification.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_lifecycle_preflight$
declare
  v_table oid := to_regclass('public.studio2_edition_runtime');
  v_wrapper oid := to_regprocedure('public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)');
  v_private oid := to_regprocedure('private.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)');
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::integer / 10000 <> 17
     or v_table is null or v_wrapper is null or v_private is null
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
     or exists (select 1 from private.v3_migration_contracts
       where migration_key = 'v3.s16.edition-runtime-api-dml-retirement')
  then
    raise exception 'S16 edition runtime cutover requires PG17 source owner, registry and exact V3 commands'
      using errcode = '55000';
  end if;

  if not exists (select 1 from pg_class c
       where c.oid = v_table and c.relkind = 'r' and c.relrowsecurity
         and pg_get_userbyid(c.relowner) = 'postgres')
     or exists (select 1 from pg_attribute a
       where a.attrelid = v_table and a.attnum > 0
         and not a.attisdropped and a.attacl is not null)
     or not exists (select 1 from pg_trigger t
       where t.tgrelid = v_table
         and t.tgname = 'v3_guard_archive_runtime_transition'
         and t.tgfoid = to_regprocedure('private.v3_guard_archive_runtime_transition()')
         and t.tgenabled = 'O' and not t.tgisinternal)
     or not exists (select 1 from pg_trigger t
       where t.tgrelid = 'public.editions'::regclass
         and t.tgname = 'studio2_seed_edition_runtime_after_insert'
         and t.tgfoid = to_regprocedure('private.studio2_seed_edition_runtime()')
         and t.tgenabled = 'O' and not t.tgisinternal)
  then
    raise exception 'S16 edition runtime table, Archive guard or seed trigger drift'
      using errcode = '55000';
  end if;

  if not exists (select 1 from pg_proc p where p.oid = v_wrapper
       and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
       and p.proconfig = array['search_path=pg_catalog, public, private, auth']::text[]
       and position('private.v3_arm_archive_runtime_transition_gate' in p.prosrc) > 0
       and position('private.studio2_transition_edition_v3(' in p.prosrc) > 0)
     or not exists (select 1 from pg_proc p where p.oid = v_private
       and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
       and position('p_expected_version' in p.prosrc) > 0
       and position('private.studio2_claim_operation(' in p.prosrc) > 0
       and position('private.studio2_complete_operation(' in p.prosrc) > 0)
     or has_function_privilege('anon', v_wrapper, 'EXECUTE')
     or not has_function_privilege('authenticated', v_wrapper, 'EXECUTE')
     or not has_function_privilege('service_role', v_wrapper, 'EXECUTE')
     or has_function_privilege('anon', v_private, 'EXECUTE')
     or has_function_privilege('authenticated', v_private, 'EXECUTE')
     or has_function_privilege('service_role', v_private, 'EXECUTE')
  then
    raise exception 'S16 canonical lifecycle wrapper, CAS, receipt or EXECUTE contract drift'
      using errcode = '55000';
  end if;

  if not has_table_privilege('service_role', v_table, 'SELECT')
     or not has_table_privilege('authenticated', v_table, 'SELECT')
     or not has_table_privilege('service_role', v_table, 'INSERT,UPDATE,DELETE,TRUNCATE')
  then
    raise exception 'S16 edition runtime observed API-role grant or read contract drift'
      using errcode = '55000';
  end if;
end $s16_lifecycle_preflight$;

select public.v3_register_migration_contract(
  'v3.s16.edition-runtime-api-dml-retirement', 1,
  'forward_fix_only', false, null,
  'Retire raw API DML on edition runtime while preserving V3 receipt/CAS transition, edition seeding and Archive denial'
);

revoke insert, update, delete, truncate, references, trigger, maintain
  on table public.studio2_edition_runtime
  from public, anon, authenticated, service_role;

do $s16_lifecycle_postcheck$
declare v_role text; v_priv text;
begin
  foreach v_role in array array['anon','authenticated','service_role'] loop
    foreach v_priv in array array[
      'INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'
    ] loop
      if has_table_privilege(v_role, 'public.studio2_edition_runtime', v_priv)
      then
        raise exception 'S16 direct edition runtime mutation survived: % %', v_role, v_priv
          using errcode = '42501';
      end if;
    end loop;
    if has_any_column_privilege(v_role,'public.studio2_edition_runtime','INSERT,UPDATE')
    then
      raise exception 'S16 edition runtime column DML survived: %', v_role
        using errcode = '42501';
    end if;
  end loop;
  if not has_table_privilege('service_role','public.studio2_edition_runtime','SELECT')
     or not has_table_privilege('authenticated','public.studio2_edition_runtime','SELECT')
     or not has_function_privilege('authenticated',
       'public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE')
  then
    raise exception 'S16 edition runtime read or canonical command contract regressed'
      using errcode = '55000';
  end if;
end $s16_lifecycle_postcheck$;

notify pgrst, 'reload schema';
commit;
