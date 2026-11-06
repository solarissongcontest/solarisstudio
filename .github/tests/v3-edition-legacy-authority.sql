-- Only execute against the disposable database established by the shared bootstrap.
begin;
do $test$
declare role_name text; target regprocedure := 'public.studio2_transition_edition_v2(uuid,text,text,uuid)'::regprocedure;
begin
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,target,'EXECUTE') then
   raise exception 'Legacy Edition writer remains effectively executable by %',role_name;
  end if;
 end loop;
 if not has_function_privilege('authenticated','public.studio2_transition_edition_v3(uuid,text,text,uuid,bigint,uuid,text)','EXECUTE') then
  raise exception 'Canonical Edition lifecycle API was removed';
 end if;
 -- Ownership/superuser execution cannot reactivate the old mutation body either.
 begin
  perform public.studio2_transition_edition_v2(null,'active',null,null);
  raise exception 'Privileged legacy Edition mutation did not fail closed';
 exception when feature_not_supported then null; end;
end $test$;

set local role anon;
do $test$ begin
 begin
  perform public.studio2_transition_edition_v2(null,'active',null,null);
  raise exception 'Anonymous legacy writer accepted execution';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
 begin
  perform public.studio2_transition_edition_v2(null,'active',null,null);
  raise exception 'Authenticated legacy writer accepted execution';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
set local role service_role;
do $test$ begin
 begin
  perform public.studio2_transition_edition_v2(null,'active',null,null);
  raise exception 'Service legacy writer accepted execution';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
