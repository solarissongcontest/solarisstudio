-- SYSTEM-OWNED FORWARD-ONLY S16 CLOSURE (local rehearsal candidate).
 -- S16 cuts off direct Confirmation API table writes and the TRUNCATE bypass.
-- RLS alone cannot enforce the governed CAS/receipt authority. S08 and
-- Combined already cut off Televote TRUNCATE; this stage verifies them but does
-- not create a second owner. It does NOT claim that existing
-- other launch-domain grants are safe or that S16 is fully certified.
-- Apply only after the guarded S13/Confirmation/S07/S08/Jury/Results chain.
-- Never execute on hosted production without separately approved operator package.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_preflight$
declare
 v_target text;
 v_role text;
 v_privilege text;
 v_expected boolean;
 v_actual boolean;
 v_relation pg_class%rowtype;
begin
 if current_user <> 'postgres'
    or current_setting('server_version_num') <> '170011'
    or (select rolsuper or not rolbypassrls from pg_roles where rolname=current_user)
    or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
    or to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null
    or to_regprocedure('private.v3_guard_source_managed_televote_projection()') is null
    or to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)') is null then
    raise exception 'S16 Confirmation TRUNCATE cutover requires reviewed complete recovery owner and canonical operations' using errcode='55000';
 end if;
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.s16.launch-table-truncate-cutover') then
    raise exception 'S16 Confirmation TRUNCATE cutover already installed' using errcode='55000';
 end if;
 if not exists (select 1 from pg_trigger
    where tgrelid='public.televote_votes'::regclass
      and tgname='v3_guard_source_managed_televote_projection'
      and not tgisinternal and tgenabled='O') then
    raise exception 'S08 source projection guard inactive' using errcode='55000';
 end if;
 for v_target in select unnest(array[
      'public.submissions','public.edit_tokens','public.televote_votes',
      'televoting.televote_aggregations'
    ]) loop
   select * into v_relation from pg_class where oid=to_regclass(v_target);
   if v_relation.oid is null or v_relation.relkind<>'r'
      or pg_get_userbyid(v_relation.relowner)<>'postgres'
      or not v_relation.relrowsecurity then
     raise exception 'S16 unqualified RLS-protected official table: %',v_target using errcode='55000';
   end if;
   for v_role in select unnest(array['anon','authenticated','service_role']) loop
     v_expected := v_target in ('public.submissions','public.edit_tokens');
     v_actual := has_table_privilege(v_role,v_target,'TRUNCATE');
     if v_actual is distinct from v_expected then
       raise exception 'S16 unexpected direct TRUNCATE authority % on %: observed %, expected %',
         v_role,v_target,v_actual,v_expected using errcode='55000';
     end if;
     if v_expected then
       if exists(select 1 from pg_attribute a where a.attrelid=v_relation.oid
          and a.attnum>0 and not a.attisdropped and a.attacl is not null) then
         raise exception 'S16 unexpected Confirmation column-level grants: %',v_target using errcode='55000';
       end if;
       foreach v_privilege in array array['INSERT','UPDATE','DELETE','REFERENCES','TRIGGER'] loop
         if not has_table_privilege(v_role,v_target,v_privilege) then
           raise exception 'S16 unqualified Confirmation table privilege % % %',v_role,v_target,v_privilege using errcode='55000';
         end if;
       end loop;
     end if;
   end loop;
 end loop;
end
$s16_preflight$;

select public.v3_register_migration_contract(
 'v3.s16.launch-table-truncate-cutover',1,'forward_fix_only',false,null,
 'Retire direct Confirmation API DML and table-admin privileges; verify Televote S08 and Combined grants while retaining governed commands and reads'
);

-- S08 and Combined already govern Televote; do not duplicate their ACL mutation.
revoke insert,update,delete,truncate,references,trigger,maintain on table
 public.submissions,
 public.edit_tokens
 from public,anon,authenticated,service_role;

do $s16_postcheck$
declare v_target text; v_role text; v_privilege text;
begin
 for v_target in select unnest(array[
   'public.submissions','public.edit_tokens','public.televote_votes',
   'televoting.televote_aggregations']) loop
   for v_role in select unnest(array['anon','authenticated','service_role']) loop
     if has_table_privilege(v_role,v_target,'TRUNCATE') then
       raise exception 'S16 RLS-independent API TRUNCATE remains: % %',v_role,v_target using errcode='42501';
     end if;
     if v_target in ('public.submissions','public.edit_tokens') then
       foreach v_privilege in array array['INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','MAINTAIN'] loop
         if has_table_privilege(v_role,v_target,v_privilege) then
           raise exception 'S16 direct Confirmation API table authority remains: % % %',v_role,v_target,v_privilege using errcode='42501';
         end if;
       end loop;
     end if;
   end loop;
   if not has_table_privilege('postgres',v_target,'TRUNCATE') then
     raise exception 'S16 canonical owner execution lost: %',v_target using errcode='55000';
   end if;
 end loop;
 if to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null
    or to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint,bigint,uuid,uuid)') is null then
    raise exception 'S16 cutover lost canonical command identity' using errcode='55000';
 end if;
end
$s16_postcheck$;
commit;
