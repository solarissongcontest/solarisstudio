begin;
do $catalog$
declare v_table text; v_role text; v_priv text;
begin
 foreach v_table in array array['public.submission_rounds','public.submissions','public.submission_versions','public.studio2_confirmation_requirements','public.internal_entries'] loop
  foreach v_role in array array['anon','authenticated','service_role'] loop
   foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege(v_role,v_table,v_priv) then raise exception 'Raw Confirmation/Entry authority remains: % % %',v_role,v_table,v_priv; end if;
   end loop;
  end loop;
 end loop;
 if not exists(select 1 from pg_proc where oid='public.v3_sync_confirmation_entry(uuid)'::regprocedure and prosecdef and proowner='postgres'::regrole) then raise exception 'Canonical sync lost owner authority'; end if;
 if not has_function_privilege('service_role','public.v3_sync_confirmation_entry(uuid)','EXECUTE') then raise exception 'Server canonical Entry projection unavailable'; end if;
 if not exists(select 1 from pg_proc where oid='public.studio2_apply_confirmation_entry_review(text,uuid,text,text,uuid,text,bigint,uuid,uuid)'::regprocedure and prosecdef and proowner='postgres'::regrole) then raise exception 'Canonical review lost owner authority'; end if;
end
$catalog$;
set local role anon;
do $anonymous$
begin
 begin
  truncate public.submissions;
  raise exception 'Anonymous Confirmation truncate accepted';
 exception when insufficient_privilege then null; end;
 begin
  truncate public.internal_entries;
  raise exception 'Anonymous internal Entry truncate accepted';
 exception when insufficient_privilege then null; end;
end
$anonymous$;
set local role service_role;
do $service$
begin
 begin
  update public.studio2_confirmation_requirements set updated_at=now();
  raise exception 'Service raw requirement overwrite accepted';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.submission_versions;
  raise exception 'Service raw submission history deletion accepted';
 exception when insufficient_privilege then null; end;
end
$service$;
rollback;
