-- DARK installation: source RPC bodies preserved; activation is a separate decision.
-- Remove only privileges on objects created by this transaction. No global defaults.
do $s13_first_batch_acl$
declare t text; f text; seq text; grantee_sql text;
begin
  foreach t in array array['v3_migration_contracts','v3_schema_compatibility','v3_schema_compatibility_history','v3_backfill_jobs','v3_migration_parity_runs'] loop
    execute format('revoke all on table private.%I from public, anon, authenticated, service_role',t);
    for grantee_sql in select distinct case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end
      from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      where c.oid=to_regclass(format('private.%I',t)) and a.grantee<>c.relowner loop
      execute format('revoke all on table private.%I from %s',t,grantee_sql);
    end loop;
    for seq in select format('%I.%I',ns.nspname,c.relname) from pg_class c
      join pg_namespace ns on ns.oid=c.relnamespace
      join pg_depend d on d.objid=c.oid and d.classid='pg_class'::regclass
      where c.relkind='S' and d.refobjid=to_regclass(format('private.%I',t)) and d.deptype in ('a','i') loop
      execute 'revoke all on sequence '||seq||' from public, anon, authenticated, service_role';
      for grantee_sql in select distinct case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end
        from pg_class c cross join lateral aclexplode(coalesce(c.relacl,acldefault('s',c.relowner))) a
        where c.oid=to_regclass(seq) and a.grantee<>c.relowner loop
        execute 'revoke all on sequence '||seq||' from '||grantee_sql;
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
    execute 'revoke all on function '||f||' from public, anon, authenticated, service_role';
    for grantee_sql in select distinct case when a.grantee=0 then 'PUBLIC' else quote_ident(pg_get_userbyid(a.grantee)) end
      from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      where p.oid=to_regprocedure(f) and a.grantee<>p.proowner loop
      execute 'revoke all on function '||f||' from '||grantee_sql;
    end loop;
  end loop;
grant execute on function public.v3_schema_compatibility(integer) to anon, authenticated, service_role;
end
$s13_first_batch_acl$;
