\set ON_ERROR_STOP on
-- Disposable local fixture only: DML permission checks require a writable
-- transaction, and every probe is rolled back.
begin;
do $test$
declare actor text; invocation text; denied boolean;
begin
 foreach actor in array array['anon','authenticated','service_role'] loop
  foreach invocation in array array[
   'insert into public.studio2_result_operations default values',
   'update public.studio2_result_operations set calculation_version=calculation_version where false',
   'delete from public.studio2_result_operations where false',
   'truncate public.studio2_result_operations',
   'insert into public.studio2_result_operation_executions default values',
   'update public.studio2_result_operation_executions set payload=payload where false',
   'delete from public.studio2_result_operation_executions where false',
   'truncate public.studio2_result_operation_executions'
  ] loop
   execute format('set local role %I',actor);
   denied:=false;
   begin execute invocation;exception when insufficient_privilege then denied:=true;end;
   reset role;
   if not denied then raise exception 'Direct Results operation writer accepted: % %',actor,invocation;end if;
  end loop;
 end loop;
end $test$;
rollback;
