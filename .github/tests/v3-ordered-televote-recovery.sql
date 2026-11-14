-- Actual hosted-observed relations; no permissive authority stubs or application fixtures.
do $check$
declare r text; failed boolean;
begin
  if to_regclass('private.v3_televote_result_projection_sources') is null or
     to_regclass('private.v3_televote_projection_write_context') is null then
    raise exception 'Ordered recovery omitted canonical ledgers';
  end if;
  foreach r in array array['anon','authenticated','service_role'] loop
    if has_function_privilege(r,'private.v3_apply_published_televote_projection(uuid,uuid,text,text,integer,timestamptz,jsonb)','EXECUTE')
       or has_table_privilege(r,'private.v3_televote_projection_write_context','INSERT')
       or has_table_privilege(r,'private.v3_televote_result_projection_sources','UPDATE') then
      raise exception 'Ungoverned payload/context/provenance writer: %',r;
    end if;
    execute format('set local role %I',r);
    failed:=false;
    begin
      perform private.v3_apply_published_televote_projection(null,null,'round','forged',1,now(),'[]'::jsonb);
    exception when insufficient_privilege then failed:=true; end;
    reset role;
    if not failed then raise exception 'Direct payload execution was not denied: %',r; end if;
  end loop;
  if not has_function_privilege('service_role','private.v3_sync_published_televote_round(uuid)','EXECUTE')
     or has_function_privilege('authenticated','private.v3_sync_published_televote_round(uuid)','EXECUTE') then
    raise exception 'Canonical source adapter ACL mismatch';
  end if;
  if exists(select 1 from private.v3_televote_projection_write_context) then
    raise exception 'Leaked writer context';
  end if;
end $check$;
select 'PASS: ordered S13/Archive/Televote authority on hosted-observed relations';
