begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- The canonical operation/CAS commands and invalidation triggers are owner-
-- executed. API table grants are not authority to fabricate release pointers
-- or execution receipts, including when the API role bypasses RLS.
do $pre$begin
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.results.operation-tables-owner-only') then
  raise exception 'Results operation table cutover already installed' using errcode='55000';
 end if;
 if not exists(select 1 from pg_proc where oid=to_regprocedure(
  'public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)')
  and prosecdef and pg_get_userbyid(proowner)='postgres') then
  raise exception 'Owner-executed reviewed Results command required' using errcode='55000';
 end if;
end $pre$;
select public.v3_register_migration_contract('v3.results.operation-tables-owner-only',1,
 'forward_fix_only',false,null,'Retire direct API Results release-pointer and receipt writes; preserve canonical owner-executed commands and existing reads');
do $guard$
declare identity text; columns text; actor text;
begin
 foreach identity in array array['public.studio2_result_operations','public.studio2_result_operation_executions'] loop
  if not exists(select 1 from pg_class where oid=to_regclass(identity)
   and pg_get_userbyid(relowner)='postgres' and relrowsecurity) then
   raise exception 'Unqualified Results operation relation: %',identity using errcode='55000';
  end if;
  execute format('revoke insert,update,delete,truncate,references,trigger,maintain on table %s from public,anon,authenticated,service_role',identity);
  select string_agg(quote_ident(attname),',' order by attnum) into columns
   from pg_attribute where attrelid=to_regclass(identity) and attnum>0 and not attisdropped;
  execute format('revoke insert(%1$s),update(%1$s),references(%1$s) on table %2$s from public,anon,authenticated,service_role',columns,identity);
  foreach actor in array array['anon','authenticated','service_role'] loop
   if has_table_privilege(actor,identity,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    or has_any_column_privilege(actor,identity,'INSERT,UPDATE,REFERENCES') then
    raise exception 'Inherited Results operation write authority remains: % %',actor,identity using errcode='42501';
   end if;
  end loop;
 end loop;
end $guard$;
notify pgrst,'reload schema';
commit;
