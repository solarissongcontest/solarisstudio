-- S08 in the same networkless, hosted-observed-catalog recovery database as S13/Archive/S07.
-- No application rows or production database connection. The adversarial
-- ballot/replay cases remain owned by the dedicated synthetic S07/S08 suite.
do $s08_observed_check$
declare
  v_role text;
  v_guard pg_proc%rowtype;
  v_denied boolean;
begin
  select * into v_guard from pg_proc
  where oid=to_regprocedure('private.v3_guard_source_managed_televote_projection()');
  if v_guard.oid is null or not v_guard.prosecdef
     or pg_get_userbyid(v_guard.proowner) <> 'postgres'
     or v_guard.proconfig is distinct from
       array['search_path=pg_catalog, public, private']::text[]
     or strpos(v_guard.prosrc, 'writer.transaction_id=pg_current_xact_id()')=0
     or strpos(v_guard.prosrc, 'writer.show_id=v_previous_show_id')=0
     or to_regclass('private.v3_televote_result_projection_sources') is null
     or to_regclass('private.v3_televote_projection_write_context') is null
     or not exists (
       select 1 from pg_trigger
       where tgrelid='public.televote_votes'::regclass
         and tgname='v3_guard_source_managed_televote_projection'
         and not tgisinternal and tgenabled='O'
     ) then
    raise exception 'Ordered S08 guard/trigger/provenance authority mismatch';
  end if;
  if exists (select 1 from private.v3_televote_projection_write_context) then
    raise exception 'Ordered S08 leaked a projection transaction context';
  end if;
  foreach v_role in array array['anon','authenticated','service_role'] loop
    if has_table_privilege(v_role,'public.televote_votes','INSERT')
       or has_table_privilege(v_role,'public.televote_votes','UPDATE')
       or has_table_privilege(v_role,'public.televote_votes','DELETE')
       or has_table_privilege(v_role,'private.v3_televote_projection_write_context','INSERT')
       or has_function_privilege(v_role,
         'private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)',
         'EXECUTE') then
      raise exception 'Ordered S08 retained competing API writer: %',v_role;
    end if;
    execute format('set local role %I',v_role);
    v_denied:=false;
    begin
      execute 'insert into public.televote_votes default values';
    exception when insufficient_privilege then v_denied:=true; end;
    reset role;
    if not v_denied then
      raise exception 'Ordered S08 allowed direct ballot projection INSERT: %',v_role;
    end if;
    execute format('set local role %I',v_role);
    v_denied:=false;
    begin
      execute 'update public.televote_votes set points=points where false';
    exception when insufficient_privilege then v_denied:=true; end;
    reset role;
    if not v_denied then
      raise exception 'Ordered S08 allowed direct ballot projection UPDATE: %',v_role;
    end if;
    execute format('set local role %I',v_role);
    v_denied:=false;
    begin
      execute 'delete from public.televote_votes where false';
    exception when insufficient_privilege then v_denied:=true; end;
    reset role;
    if not v_denied then
      raise exception 'Ordered S08 allowed direct ballot projection DELETE: %',v_role;
    end if;
  end loop;
  if not has_function_privilege('service_role',
      'private.v3_sync_published_televote_round(uuid)','EXECUTE')
     or has_function_privilege('authenticated',
      'private.v3_sync_published_televote_round(uuid)','EXECUTE') then
    raise exception 'Ordered S08 altered the canonical source adapter authority';
  end if;
end $s08_observed_check$;
select 'PASS: networkless hosted-observed S08 API DML denial and source authority';
