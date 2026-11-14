begin;
set local lock_timeout='5s';
set local statement_timeout='30s';
-- Forward-only follow-up: the governed command implements these writes itself;
-- no service-role compatibility delegate is needed. Owner execution remains.
do $pre$
declare identity text; routine record; legacy_name text;
begin
 if to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null then raise exception 'Governed Confirmation access prerequisite missing' using errcode='55000';end if;
 foreach identity in array array['public.admin_confirmation_create_edit_token(uuid,text,integer)','public.admin_confirmation_revoke_edit_token(uuid)','public.admin_confirmation_delete_response(uuid)','public.admin_update_confirmation_controls(uuid,boolean,boolean,text)']loop
  select * into routine from pg_proc where oid=to_regprocedure(identity);
  if routine.oid is null or pg_get_userbyid(routine.proowner)<>'postgres' or not routine.prosecdef then raise exception 'Unqualified legacy Confirmation function: %',identity using errcode='55000';end if;
  legacy_name:=split_part(split_part(identity,'(',1),'.',2);
  if (select count(*)from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=legacy_name)<>1 then raise exception 'Unqualified legacy Confirmation overloads: %',identity using errcode='55000';end if;
 end loop;
end $pre$;
select public.v3_register_migration_contract('v3.confirmation.legacy-writers-owner-only',1,'forward_fix_only',false,null,'Close privileged API bypass of actor-scoped versioned Confirmation commands; retain owner-only historical implementation');
revoke all on function public.admin_confirmation_create_edit_token(uuid,text,integer),public.admin_confirmation_revoke_edit_token(uuid),public.admin_confirmation_delete_response(uuid),public.admin_update_confirmation_controls(uuid,boolean,boolean,text) from public,anon,authenticated,service_role;
do $post$
declare identity text; actor_role text;
begin
 foreach identity in array array['public.admin_confirmation_create_edit_token(uuid,text,integer)','public.admin_confirmation_revoke_edit_token(uuid)','public.admin_confirmation_delete_response(uuid)','public.admin_update_confirmation_controls(uuid,boolean,boolean,text)']loop
  foreach actor_role in array array['anon','authenticated','service_role']loop
   if has_function_privilege(actor_role,to_regprocedure(identity),'EXECUTE') then raise exception 'Legacy Confirmation API bypass remains for %: %',actor_role,identity using errcode='42501';end if;
  end loop;
  if not has_function_privilege('postgres',to_regprocedure(identity),'EXECUTE') then raise exception 'Legacy owner execution lost: %',identity;end if;
 end loop;
end $post$;
notify pgrst,'reload schema';
commit;
