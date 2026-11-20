-- Read-only assertions; embed before COMMIT and reuse in a separate RO postflight.
do $s13_first_batch_postconditions$
declare t text; f text; seq text; r text; p text;
begin
  foreach t in array array['v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs'] loop
    if not exists(select 1 from pg_class where oid=to_regclass(format('private.%I',t))
      and relkind='r' and pg_get_userbyid(relowner)='postgres' and not relrowsecurity and not relforcerowsecurity)
      or exists(select 1 from pg_policy where polrelid=to_regclass(format('private.%I',t))) then
      raise exception 'S13 batch table owner/RLS source contract differs: %',t using errcode='55000';
    end if;
    if exists(select 1 from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
       where c.oid=to_regclass(format('private.%I',t)) and a.grantee<>c.relowner) then
      raise exception 'S13 batch table has nonowner grants: %',t using errcode='42501';
    end if;
    foreach r in array array['anon','authenticated','service_role'] loop
      foreach p in array array['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(r,format('private.%I',t),p) then
          raise exception 'S13 batch API table privilege remains: % % %',r,t,p using errcode='42501';
        end if;
      end loop;
      foreach p in array array['SELECT','INSERT','UPDATE','REFERENCES'] loop
        if has_any_column_privilege(r,format('private.%I',t),p) then
          raise exception 'S13 batch API column privilege remains: % % %',r,t,p using errcode='42501';
        end if;
      end loop;
      for seq in select format('%I.%I',ns.nspname,c.relname) from pg_class c
        join pg_namespace ns on ns.oid=c.relnamespace join pg_depend d on d.objid=c.oid and d.classid='pg_class'::regclass
        where c.relkind='S' and d.refobjid=to_regclass(format('private.%I',t)) and d.deptype in ('a','i') loop
        if has_sequence_privilege(r,seq,'SELECT,USAGE,UPDATE') then
          raise exception 'S13 batch API sequence privilege remains: % %',r,seq using errcode='42501';
        end if;
      end loop;
    end loop;
  end loop;
  foreach f in array array[
    'public.v3_schema_compatibility(integer)',
    'public.v3_register_migration_contract(text,integer,text,boolean,text,text)',
    'public.v3_claim_backfill(text,integer,integer,text,integer,bigint)',
    'public.v3_checkpoint_backfill(text,text,jsonb,integer,integer,text,boolean)',
    'public.v3_fail_backfill(text,text,text)',
    'public.v3_record_migration_parity(text,text,bigint,bigint,bigint,bigint,integer,jsonb)',
    'public.v3_set_schema_compatibility(integer,integer,integer,text,text,text)'
  ] loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(f) and pg_get_userbyid(proowner)='postgres'
        and prosecdef and proconfig=array['search_path=pg_catalog, public, private']) then
      raise exception 'S13 batch function authority/search path differs: %',f using errcode='55000';
    end if;
    if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
       where p.oid=to_regprocedure(f) and a.grantee<>p.proowner and
       (f<>'public.v3_schema_compatibility(integer)' or pg_get_userbyid(a.grantee) not in ('anon','authenticated','service_role') or a.is_grantable)) then
      raise exception 'S13 batch function has unapproved grants: %',f using errcode='42501';
    end if;
    foreach r in array array['anon','authenticated','service_role'] loop
      if has_function_privilege(r,f,'EXECUTE') <> (f='public.v3_schema_compatibility(integer)') then
        raise exception 'S13 batch API function execution differs: % %',r,f using errcode='42501';
      end if;
    end loop;
  end loop;
  if (select count(*) from private.v3_migration_contracts)<>2
    or (select count(*) from private.v3_schema_compatibility)<>1
    or not exists(select 1 from private.v3_schema_compatibility where singleton and current_schema_version=1
      and min_client_schema_version=1 and max_client_schema_version=1 and phase='expand' and migration_key='baseline.v3')
    or exists(select 1 from private.v3_migration_contracts where migration_key not in ('v3.s13.migration-hardening','v3.s13.strict-registration-restore'))
    or exists(select 1 from private.v3_schema_compatibility_history)
    or exists(select 1 from private.v3_backfill_jobs)
    or exists(select 1 from private.v3_migration_parity_runs) then
    raise exception 'S13 batch seed or unexpected worker state differs' using errcode='55000';
  end if;
end
$s13_first_batch_postconditions$;
