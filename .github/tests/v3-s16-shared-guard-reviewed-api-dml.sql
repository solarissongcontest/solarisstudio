\set ON_ERROR_STOP on
-- Network-isolated S16 rehearsal only; not a production target.
do $pre$
declare v_table text;
begin
 if current_user <> 'postgres'
    or current_setting('server_version_num')::integer / 10000 <> 17
    or not exists (select 1 from private.v3_migration_contracts
      where migration_key='v3.s16.shared-guard-reviewed-api-dml-cutover')
 then raise exception 'S16 shared guard role probe refused incomplete candidate'
   using errcode='55000'; end if;
 foreach v_table in array array['public.results','public.televote_votes'] loop
   if not exists(select 1 from pg_trigger where tgrelid=to_regclass(v_table)
     and tgname='studio2_platform_direct_write_guard'
     and tgenabled='O' and tgtype=30 and not tgisinternal
     and tgfoid='private.studio2_guard_direct_client_write()'::regprocedure)
   then raise exception 'S16 guard identity drift %',v_table using errcode='55000'; end if;
 end loop;
end $pre$;

begin;
set local role anon;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $denials$
declare v_table text; v_statement text; v_col text;
begin
 if current_user <> 'anon' then raise exception 'S16 effective role changed' using errcode='55000'; end if;
 foreach v_table in array array['public.results','public.televote_votes'] loop
  v_col:='show_id';
  if has_table_privilege(current_user,v_table,'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege(current_user,v_table,'INSERT,UPDATE') then
     raise exception 'S16 surviving API DML % %',current_user,v_table using errcode='55000';
  end if;
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,v_col,v_col),
    format('delete from %s where false',v_table),
    format('truncate table %s',v_table)
  ] loop
   begin
     execute v_statement;
     raise exception 'S16 unauthorized direct SQL succeeded: %',v_statement;
   exception when insufficient_privilege then null;
   end;
  end loop;
  if not has_table_privilege('service_role',v_table,'SELECT') then
    raise exception 'S16 service SELECT regressed %',v_table using errcode='55000';
  end if;
 end loop;
 raise notice 'PASS: anon direct DML/TRUNCATE denied under forged recovery markers (8 of 24)';
end $denials$;
rollback;

begin;
set local role authenticated;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $denials$
declare v_table text; v_statement text; v_col text;
begin
 if current_user <> 'authenticated' then raise exception 'S16 effective role changed' using errcode='55000'; end if;
 foreach v_table in array array['public.results','public.televote_votes'] loop
  v_col:='show_id';
  if has_table_privilege(current_user,v_table,'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege(current_user,v_table,'INSERT,UPDATE') then
     raise exception 'S16 surviving API DML % %',current_user,v_table using errcode='55000';
  end if;
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,v_col,v_col),
    format('delete from %s where false',v_table),
    format('truncate table %s',v_table)
  ] loop
   begin
     execute v_statement;
     raise exception 'S16 unauthorized direct SQL succeeded: %',v_statement;
   exception when insufficient_privilege then null;
   end;
  end loop;
  if not has_table_privilege('service_role',v_table,'SELECT') then
    raise exception 'S16 service SELECT regressed %',v_table using errcode='55000';
  end if;
 end loop;
 raise notice 'PASS: authenticated direct DML/TRUNCATE denied under forged recovery markers (8 of 24)';
end $denials$;
rollback;

begin;
set local role service_role;
select set_config('studio2.platform_recovery_write','on',true);
select set_config('studio2.confirmation_maintenance_write','on',true);
do $denials$
declare v_table text; v_statement text; v_col text;
begin
 if current_user <> 'service_role' then raise exception 'S16 effective role changed' using errcode='55000'; end if;
 foreach v_table in array array['public.results','public.televote_votes'] loop
  v_col:='show_id';
  if has_table_privilege(current_user,v_table,'INSERT,UPDATE,DELETE,TRUNCATE')
    or has_any_column_privilege(current_user,v_table,'INSERT,UPDATE') then
     raise exception 'S16 surviving API DML % %',current_user,v_table using errcode='55000';
  end if;
  foreach v_statement in array array[
    format('insert into %s default values',v_table),
    format('update %s set %I=%I where false',v_table,v_col,v_col),
    format('delete from %s where false',v_table),
    format('truncate table %s',v_table)
  ] loop
   begin
     execute v_statement;
     raise exception 'S16 unauthorized direct SQL succeeded: %',v_statement;
   exception when insufficient_privilege then null;
   end;
  end loop;
  if not has_table_privilege('service_role',v_table,'SELECT') then
    raise exception 'S16 service SELECT regressed %',v_table using errcode='55000';
  end if;
 end loop;
 raise notice 'PASS: service_role direct DML/TRUNCATE denied under forged recovery markers (8 of 24)';
end $denials$;
rollback;

-- Actual caller execution of canonical SECURITY DEFINER entry points must
-- enter argument validation rather than fail because direct table ACL changed.
begin;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
do $reconcile$
declare v_msg text;
begin
 if not has_function_privilege('service_role',
      'public.v3_reconcile_published_televote(text,uuid)','EXECUTE') then
    raise exception 'S16 service-only canonical reconciliation EXECUTE missing' using errcode='55000';
 end if;
 begin
   perform public.v3_reconcile_published_televote('invalid',null);
   raise exception 'S16 invalid Televote source unexpectedly accepted';
 exception when invalid_parameter_value then
   get stacked diagnostics v_msg = message_text;
   if v_msg <> 'Invalid Televote recovery source identity' then
     raise exception 'S16 Televote RPC rejected at wrong authority: %',v_msg;
   end if;
 end;
 raise notice 'PASS: service_role reached canonical Televote RPC validation despite revoked direct DML';
end $reconcile$;
rollback;

do $protected_commands$
begin
 if not has_function_privilege('authenticated',
      'public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)','EXECUTE') then
   raise exception 'S16 canonical authenticated Results command EXECUTE regression' using errcode='55000';
 end if;
end $protected_commands$;
