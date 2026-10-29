begin;
select public.v3_register_migration_contract('v3.televote.calculation-dml-cutover',1,'forward_fix_only',false,null,'All round and conversion application writers use governed SECURITY DEFINER commands; remove raw table and column DML without changing read access.');
do $cutover$
declare t text; c text; r text; before_select boolean;
begin
 foreach t in array array['rounds','round_results','round_influence_results'] loop
  foreach r in array array['public','anon','authenticated','service_role'] loop
   -- PUBLIC is a pseudo-role: concrete roles below verify effective reads.
   if r<>'public' then before_select:=has_table_privilege(r,format('televoting.%I',t),'SELECT'); end if;
   execute format('revoke insert,update,delete,truncate on televoting.%I from %I',t,r);
   for c in select attname from pg_attribute where attrelid=format('televoting.%I',t)::regclass and attnum>0 and not attisdropped loop
    execute format('revoke insert(%I),update(%I) on televoting.%I from %I',c,c,t,r);
   end loop;
   if r<>'public' and has_table_privilege(r,format('televoting.%I',t),'SELECT') is distinct from before_select then raise exception 'Read privilege changed during cutover'; end if;
  end loop;
 end loop;
end $cutover$;
-- The command implementation is internal, never a peer API. The public entry
-- point remains televoting.v3_configure_round; its active session, capability,
-- CAS, immutable-state and retry behavior are tested by the conversion fixture.
do $authority$
begin
 if not (select prosecdef from pg_proc where oid='televoting.v3_configure_round(uuid,text,jsonb,bigint,uuid,text,uuid)'::regprocedure) then raise exception 'Canonical round command must own its writes'; end if;
 if exists(select 1 from unnest(array['anon','authenticated','service_role']) r where has_function_privilege(r,'private.v3_configure_round_conversion(uuid,text,jsonb,bigint,uuid,text)','EXECUTE')) then raise exception 'Internal conversion implementation exposed'; end if;
end $authority$;
commit;
