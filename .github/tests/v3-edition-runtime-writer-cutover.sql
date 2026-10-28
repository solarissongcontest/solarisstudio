begin;
do $catalog$
declare v_role text; v_priv text;
begin
 foreach v_role in array array['anon','authenticated','service_role'] loop
  foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
   if has_table_privilege(v_role,'public.studio2_edition_runtime',v_priv) then raise exception 'Raw edition runtime authority remains'; end if;
  end loop;
 end loop;
 if not has_table_privilege('authenticated','public.studio2_edition_runtime','SELECT') then raise exception 'Canonical runtime readback lost'; end if;
 if not has_function_privilege('authenticated','public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE') then raise exception 'Canonical edition transition unavailable'; end if;
end
$catalog$;
set local role service_role;
do $denied$
begin
 begin
  update public.studio2_edition_runtime set version=version+1;
  raise exception 'Service raw edition runtime update accepted';
 exception when insufficient_privilege then null; end;
 begin
  delete from public.studio2_edition_runtime;
  raise exception 'Service raw edition runtime delete accepted';
 exception when insufficient_privilege then null; end;
end
$denied$;
rollback;
