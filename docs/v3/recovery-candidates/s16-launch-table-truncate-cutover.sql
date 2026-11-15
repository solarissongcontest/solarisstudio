-- SYSTEM-OWNED FORWARD-ONLY S16 CLOSURE (local rehearsal candidate).
-- Truncate bypasses PostgreSQL row-level security. This stage closes ONLY the
-- confirmed RLS-independent TRUNCATE bypass left by S08 and Confirmation,
-- plus the legacy Televoting aggregate table. It does NOT claim that existing
-- direct INSERT/UPDATE/DELETE grants are safe or that S16 is fully certified.
-- Apply only after the guarded S13/Confirmation/S07/S08/Jury/Results chain.
-- Never execute on hosted production without separately approved operator package.
begin;
set local statement_timeout = '60s';
set local lock_timeout = '5s';

do $s16_preflight$
declare
 v_target text;
 v_role text;
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
    or to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint)') is null then
    raise exception 'S16 TRUNCATE cutover requires reviewed complete recovery owner and canonical operations' using errcode='55000';
 end if;
 if exists(select 1 from private.v3_migration_contracts where migration_key='v3.s16.launch-table-truncate-cutover') then
    raise exception 'S16 TRUNCATE cutover already installed' using errcode='55000';
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
     v_expected := case when v_target='televoting.televote_aggregations'
                        then v_role='service_role' else true end;
     v_actual := has_table_privilege(v_role,v_target,'TRUNCATE');
     if v_actual is distinct from v_expected then
       raise exception 'S16 unexpected direct TRUNCATE authority % on %: observed %, expected %',
         v_role,v_target,v_actual,v_expected using errcode='55000';
     end if;
   end loop;
 end loop;
end
$s16_preflight$;

select public.v3_register_migration_contract(
 'v3.s16.launch-table-truncate-cutover',1,'forward_fix_only',false,null,
 'Close ungoverned RLS-independent TRUNCATE on official Confirmation, public Televote projection and historic Televoting aggregate; preserve DML reads and canonical commands'
);

revoke truncate on table
 public.submissions,
 public.edit_tokens,
 public.televote_votes,
 televoting.televote_aggregations
 from public,anon,authenticated,service_role;

do $s16_postcheck$
declare v_target text; v_role text;
begin
 for v_target in select unnest(array[
   'public.submissions','public.edit_tokens','public.televote_votes',
   'televoting.televote_aggregations']) loop
   for v_role in select unnest(array['anon','authenticated','service_role']) loop
     if has_table_privilege(v_role,v_target,'TRUNCATE') then
       raise exception 'S16 RLS-independent API TRUNCATE remains: % %',v_role,v_target using errcode='42501';
     end if;
   end loop;
   if not has_table_privilege('postgres',v_target,'TRUNCATE') then
     raise exception 'S16 canonical owner execution lost: %',v_target using errcode='55000';
   end if;
 end loop;
 if to_regprocedure('public.studio2_apply_confirmation_response_access_change(uuid,uuid,text,jsonb,text,uuid,text,bigint)') is null
    or to_regprocedure('public.studio2_execute_result_operation_v2(uuid,text,text,uuid,bigint)') is null then
    raise exception 'S16 cutover lost canonical command identity' using errcode='55000';
 end if;
end
$s16_postcheck$;
commit;
