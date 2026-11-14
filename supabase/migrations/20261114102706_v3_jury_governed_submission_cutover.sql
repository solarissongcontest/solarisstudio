begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Preserve the existing scoring/submission implementation as an owner-only
-- delegate. The V3 SECURITY DEFINER command resolves the actor and records the
-- canonical idempotent receipt before returning success.
do $pre$
declare writer record; legacy record;
begin
 if (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='submit_country_jury_ballot')<>1 then
  raise exception 'Unqualified legacy Jury overloads' using errcode='55000';
 end if;
 select * into writer from pg_proc where oid=to_regprocedure('public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)');
 select * into legacy from pg_proc where oid=to_regprocedure('public.submit_country_jury_ballot(uuid,jsonb,uuid)');
 if writer.oid is null or legacy.oid is null or not writer.prosecdef or not legacy.prosecdef
  or pg_get_userbyid(writer.proowner)<>'postgres' or pg_get_userbyid(legacy.proowner)<>'postgres'
  or writer.proconfig is null or legacy.proconfig is null
  or encode(sha256(convert_to(pg_get_functiondef(writer.oid),'UTF8')),'hex')<>'0abd0a2edf61f54fed2b1db22fde200b2c965be1c0b3b1b817837daa5c0384aa'
  or encode(sha256(convert_to(pg_get_functiondef(legacy.oid),'UTF8')),'hex')<>'b9c1da106e937a1537a45c7d833ebceba05042e23b827da5907a74d7ca978264' then
   raise exception 'Jury command owner/definition drift; governed delegation unqualified' using errcode='55000';
 end if;
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.jury.governed-submission-cutover') then raise exception 'Jury submission cutover already installed' using errcode='55000';end if;
end $pre$;
select public.v3_register_migration_contract('v3.jury.governed-submission-cutover',1,'forward_fix_only',false,null,'Close direct legacy Jury RPC while retaining actor-bound V3 submission, receipts and owner delegation');
revoke all on function public.submit_country_jury_ballot(uuid,jsonb,uuid) from public,anon,authenticated,service_role;
do $post$ declare actor_role text;begin
 foreach actor_role in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(actor_role,'public.submit_country_jury_ballot(uuid,jsonb,uuid)','EXECUTE') then raise exception 'Legacy Jury RPC remains exposed: %',actor_role;end if;
 end loop;
 if not has_function_privilege('authenticated','public.v3_submit_jury_ballot(uuid,jsonb,uuid,uuid,text)','EXECUTE') or not has_function_privilege('postgres','public.submit_country_jury_ballot(uuid,jsonb,uuid)','EXECUTE') then raise exception 'Governed Jury submission or internal delegation was broken';end if;
end $post$;
commit;
