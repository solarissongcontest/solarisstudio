-- Isolated Supabase only. Assert effective grants and real invocation behavior.
begin;
do $test$
declare target regprocedure := 'televoting.submit_vote_checked(uuid,text,text,jsonb,uuid,text,text,text,text,boolean)'::regprocedure;
begin
 if to_regprocedure('televoting.submit_vote(uuid,text,text,jsonb,text,text,text,text,boolean)') is not null then
  raise exception 'Preflight-bypassing legacy ballot writer still exists'; end if;
 if not has_function_privilege('anon',target,'EXECUTE') or not has_function_privilege('authenticated',target,'EXECUTE') then
  raise exception 'Legitimate public ballot authority lost its API contract'; end if;
 if has_function_privilege('service_role',target,'EXECUTE') then
  raise exception 'Service role retained an unintended public ballot invocation path'; end if;
 if not exists (select 1 from pg_proc where oid=target and prosecdef
   and 'search_path=pg_catalog, televoting, pg_temp'=any(proconfig)) then
  raise exception 'Public ballot definer namespace was not hardened'; end if;
end $test$;

-- A direct public call cannot skip its one-shot preflight. No fixture data is
-- required: the canonical command must reject this before reading round state.
set local role anon;
do $test$ begin
 begin
  perform televoting.submit_vote_checked(null,'Unauthorized Ballot','HME','[]',null,null,null,null,null,false);
  raise exception 'Public ballot accepted missing integrity preflight';
 exception when invalid_parameter_value then
  if sqlerrm not like '%automatic voting integrity check%' then raise; end if;
 end;
end $test$;
reset role;
set local role authenticated;
do $test$ begin
 begin
  perform televoting.submit_vote_checked(null,'Unauthorized Ballot','HME','[]',null,null,null,null,null,false);
  raise exception 'Authenticated ballot accepted missing integrity preflight';
 exception when invalid_parameter_value then
  if sqlerrm not like '%automatic voting integrity check%' then raise; end if;
 end;
end $test$;
reset role;
set local role service_role;
do $test$ begin
 begin
  perform televoting.submit_vote_checked(null,'Unauthorized Ballot','HME','[]',null,null,null,null,null,false);
  raise exception 'Service-role public ballot execution succeeded';
 exception when insufficient_privilege then null; end;
end $test$;
reset role;
rollback;
