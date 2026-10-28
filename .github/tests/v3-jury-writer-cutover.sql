begin;
do $catalog$
declare v_table text; v_role text; v_priv text;
begin
 foreach v_table in array array['public.jury_voting_windows','public.jury_ballot_submissions','public.jury_votes','public.studio2_jury_window_versions'] loop
  foreach v_role in array array['anon','authenticated','service_role'] loop
   foreach v_priv in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
    if has_table_privilege(v_role,v_table,v_priv) then raise exception 'Raw Jury authority remains: % % %',v_role,v_table,v_priv; end if;
   end loop;
  end loop;
 end loop;
 foreach v_role in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(v_role,'public.submit_country_jury_ballot(uuid,jsonb,uuid)','EXECUTE') then raise exception 'Peer ballot primitive remains exposed'; end if;
 end loop;
 if not exists(select 1 from pg_proc where oid='public.submit_country_jury_ballot(uuid,jsonb,uuid)'::regprocedure and prosecdef and proowner='postgres'::regrole and array_to_string(proconfig,',') like '%search_path=pg_catalog,%') then raise exception 'Unsafe ballot implementation owner/search_path'; end if;
 if pg_get_functiondef('public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)'::regprocedure) not like '%public.submit_country_jury_ballot(_show_id, _entries, _preflight_id)%' then raise exception 'Canonical ballot call graph changed'; end if;
end
$catalog$;
set local role authenticated;
do $denied$
begin
 begin
  perform public.submit_country_jury_ballot('28113611-0000-4000-8000-000000000001','[]',null);
  raise exception 'Legacy ballot bypass accepted';
 exception when insufficient_privilege then null; end;
end
$denied$;
set local role service_role;
do $service$
begin
 begin
  delete from public.jury_votes where show_id='28113611-0000-4000-8000-000000000001';
  raise exception 'Raw Jury vote delete accepted';
 exception when insufficient_privilege then null; end;
 begin
  update public.studio2_jury_window_versions set version=version+1;
  raise exception 'Raw Jury window version overwrite accepted';
 exception when insufficient_privilege then null; end;
end
$service$;
rollback;
