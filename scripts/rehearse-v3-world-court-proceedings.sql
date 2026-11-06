-- Run ONLY against disposable local Supabase after applying the TG14 stack.
-- Every assertion is read-only. Transaction always rolls back.
begin;
do $assert$
declare
 v_table text;
 v_rpc text;
 v_restricted boolean;
begin
 foreach v_table in array array[
  'world_court_hearings','world_court_hearing_events','world_court_orders'
 ] loop
  if to_regclass('public.'||v_table) is null then
   raise exception 'TG14_PROCEEDINGS_TABLE_MISSING: %',v_table;
  end if;
  select c.relrowsecurity into v_restricted
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relname=v_table;
  if v_restricted is distinct from true then
   raise exception 'TG14_PROCEEDINGS_RLS_MISSING: %',v_table;
  end if;
  if has_table_privilege('anon','public.'||v_table,'SELECT')
    or has_table_privilege('anon','public.'||v_table,'INSERT')
    or has_table_privilege('authenticated','public.'||v_table,'INSERT')
    or has_table_privilege('authenticated','public.'||v_table,'UPDATE')
    or has_table_privilege('authenticated','public.'||v_table,'DELETE')
    or has_table_privilege('service_role','public.'||v_table,'INSERT')
    or has_table_privilege('service_role','public.'||v_table,'UPDATE')
    or has_table_privilege('service_role','public.'||v_table,'DELETE') then
   raise exception 'TG14_PROCEEDINGS_RAW_WRITE_OR_ANON_LEAK: %',v_table;
  end if;
 end loop;
 if to_regprocedure('public.world_schedule_court_hearing_v1(uuid,timestamptz,timestamptz,text,text,bigint,uuid,text,uuid)') is null
   or to_regprocedure('public.world_decide_court_hearing_v1(uuid,text,text,bigint,bigint,uuid,text,uuid)') is null
   or to_regprocedure('public.world_issue_court_order_v1(uuid,text,text,timestamptz,boolean,bigint,uuid,text,uuid)') is null
   or to_regprocedure('public.world_court_public_orders_v1(uuid)') is null then
  raise exception 'TG14_PROCEEDINGS_FUNCTION_MISSING';
 end if;
 if has_function_privilege('anon',
    'public.world_schedule_court_hearing_v1(uuid,timestamptz,timestamptz,text,text,bigint,uuid,text,uuid)','EXECUTE')
   or has_function_privilege('anon',
    'public.world_decide_court_hearing_v1(uuid,text,text,bigint,bigint,uuid,text,uuid)','EXECUTE')
   or has_function_privilege('anon',
    'public.world_issue_court_order_v1(uuid,text,text,timestamptz,boolean,bigint,uuid,text,uuid)','EXECUTE') then
  raise exception 'TG14_PROCEEDINGS_ANONYMOUS_MUTATION_EXECUTE';
 end if;
 select coalesce(bool_and(p.prosecdef),false) into v_restricted
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in (
  'world_schedule_court_hearing_v1',
  'world_decide_court_hearing_v1','world_issue_court_order_v1'
 );
 if v_restricted is distinct from true then
  raise exception 'TG14_PROCEEDINGS_UNGOVERNED_COMMAND';
 end if;
 -- Neither case filing nor private evidence is made public by this migration.
 if has_table_privilege('anon','public.world_court_cases','SELECT')
  or has_table_privilege('anon','public.world_court_filings','SELECT') then
  raise exception 'TG14_PRIVATE_COURT_RECORD_LEAK';
 end if;
end $assert$;
rollback;
