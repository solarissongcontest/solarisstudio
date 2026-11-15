-- SYSTEM-OWNED FORWARD-ONLY S16 CLOSURE (local rehearsal candidate).
 -- This stage retires direct Confirmation table mutations and TRUNCATE bypasses
-- across fourteen independently hosted-observed launch-critical relations.
-- RLS cannot replace the governed versioned CAS/receipt authority. S08 and
-- Combined separately own Televote restrictions; this verifies those effects.
-- Results and publication tables have canonical-only DML; other domain DML/RPC writers still require S16 proof.
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
 v_pub_fn pg_proc%rowtype;
 v_pub_identity text;
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
 -- Publication has two owner-executed guarded operations. Neither the
 -- scheduled service-role caller nor an authenticated Organizer requires
 -- direct table DML. Qualify both exact executable function identities.
 foreach v_pub_identity in array array[
  'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)',
  'public.studio2_publish_due_show_publications()'
 ] loop
   select * into v_pub_fn from pg_proc where oid=to_regprocedure(v_pub_identity);
   if v_pub_fn.oid is null or not v_pub_fn.prosecdef
      or pg_get_userbyid(v_pub_fn.proowner)<>'postgres'
      or v_pub_fn.proconfig is distinct from
         array['search_path=pg_catalog, public, private']::text[] then
      raise exception 'S16 unqualified canonical publication function %: oid %, owner %, definer %, config %',v_pub_identity,v_pub_fn.oid,case when v_pub_fn.oid is null then null else pg_get_userbyid(v_pub_fn.proowner) end,v_pub_fn.prosecdef,v_pub_fn.proconfig using errcode='55000';
   end if;
 end loop;
 if not has_function_privilege('authenticated',
      'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)','EXECUTE')
    or has_function_privilege('anon',
      'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)','EXECUTE')
    or not has_function_privilege('service_role',
      'public.studio2_publish_due_show_publications()','EXECUTE')
    or has_function_privilege('anon',
      'public.studio2_publish_due_show_publications()','EXECUTE')
    or has_function_privilege('authenticated',
      'public.studio2_publish_due_show_publications()','EXECUTE') then
   raise exception 'S16 publication canonical EXECUTE authority drift' using errcode='55000';
 end if;
 -- Separate from the fourteen-table TRUNCATE inventory: execution receipts
 -- also require RLS-independent TRUNCATE and API DML retirement.
 foreach v_target in array array[
   'public.studio2_show_publication_controls',
   'public.studio2_show_publication_executions'
 ] loop
   select * into v_relation from pg_class where oid=to_regclass(v_target);
   if v_relation.oid is null or v_relation.relkind<>'r'
      or pg_get_userbyid(v_relation.relowner)<>'postgres'
      or not v_relation.relrowsecurity then
     raise exception 'S16 unqualified publication table: %',v_target using errcode='55000';
   end if;
   if exists(select 1 from pg_attribute a where a.attrelid=v_relation.oid
       and a.attnum>0 and not a.attisdropped and a.attacl is not null) then
     raise exception 'S16 unexpected publication column-level grants: %',v_target using errcode='55000';
   end if;
   foreach v_role in array array['anon','authenticated'] loop
     foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE'] loop
       if has_table_privilege(v_role,v_target,v_privilege) then
         raise exception 'S16 unexpected end-user publication grant % % %',
           v_role,v_target,v_privilege using errcode='55000';
       end if;
     end loop;
   end loop;
 end loop;
 for v_target in select unnest(array[
      'public.country_accounts',
      'public.editions',
      'public.entries',
      'public.edit_tokens',
      'public.jury_votes',
      'public.results',
      'public.shows',
      'public.studio2_result_operations',
      'public.studio2_show_publication_controls',
      'public.studio2_upload_authorizations',
      'public.submissions',
      'public.televote_votes',
      'televoting.televote_aggregations',
      'televoting.vote_submissions'
    ]) loop
   select * into v_relation from pg_class where oid=to_regclass(v_target);
   if v_relation.oid is null or v_relation.relkind<>'r'
      or pg_get_userbyid(v_relation.relowner)<>'postgres'
      or not v_relation.relrowsecurity then
     raise exception 'S16 unqualified RLS-protected official table: %',v_target using errcode='55000';
   end if;
   -- Results already has an owner-executed reviewed-input/CAS operation engine.
   -- Refuse unreviewed column grants; a table-level REVOKE alone cannot
   -- eliminate a separately granted column-level INSERT/UPDATE bypass.
   if v_target='public.results' and exists (
     select 1 from pg_attribute a where a.attrelid=v_relation.oid
       and a.attnum>0 and not a.attisdropped and a.attacl is not null
   ) then
     raise exception 'S16 unexpected Results column-level grants' using errcode='55000';
   end if;
   for v_role in select unnest(array['anon','authenticated','service_role']) loop
     -- Previously observed hosted effective TRUNCATE envelope. The earlier
     -- canonical stages may already have revoked some grants. Unexpected
     -- *additional* grants fail closed rather than being silently normalized.
     v_expected := v_target in (
       'public.country_accounts','public.editions','public.entries','public.edit_tokens',
       'public.jury_votes','public.results','public.shows','public.submissions',
       'public.televote_votes'
     ) or (v_role='service_role' and v_target in (
       'public.studio2_result_operations','public.studio2_show_publication_controls',
       'public.studio2_upload_authorizations','televoting.vote_submissions',
       'televoting.televote_aggregations'
     ));
     -- S08 must have retired these specific projection TRUNCATE grants.
     if v_target in ('public.televote_votes','televoting.televote_aggregations') then
       v_expected := false;
     end if;
     v_actual := has_table_privilege(v_role,v_target,'TRUNCATE');
     if (v_target in ('public.submissions','public.edit_tokens',
           'public.televote_votes','televoting.televote_aggregations')
           and v_actual is distinct from v_expected)
        or (v_target not in ('public.submissions','public.edit_tokens',
           'public.televote_votes','televoting.televote_aggregations')
           and v_actual and not v_expected) then
       raise exception 'S16 unexpected TRUNCATE role authority % on %: observed %, expected envelope %',
         v_role,v_target,v_actual,v_expected using errcode='55000';
     end if;
     -- Hosted observation permits up to these three API roles to have
     -- prior Results DML. Some locally recovered baselines already restrict
     -- those grants; do not require an unsafe grant to exist merely to
     -- revoke it. All three roles must have NO DML after this stage.
     if v_target in ('public.submissions','public.edit_tokens') then
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
 'v3.s16.launch-table-truncate-cutover',4,'forward_fix_only',false,null,
 'Retire Confirmation, Results and publication API DML plus RLS-independent TRUNCATE on fourteen hosted-observed launch tables and publication executions'
);

-- S08 and Combined already govern Televote; do not duplicate their ACL mutation.
revoke insert,update,delete,truncate,references,trigger,maintain on table
 public.submissions,
 public.edit_tokens
 from public,anon,authenticated,service_role;
-- RLS never protects TRUNCATE. Remove additional API-role grants on launch
-- critical tables without modifying their existing DML or RPC contracts.
revoke truncate on table
 public.country_accounts,
 public.editions,
 public.entries,
 public.jury_votes,
 public.results,
 public.shows,
 public.studio2_result_operations,
 public.studio2_show_publication_controls,
 public.studio2_upload_authorizations,
 televoting.vote_submissions
 from public,anon,authenticated,service_role;
-- Results review/calculation and publication must use the already-installed
-- canonical owner-executed CAS/receipt engine, not privileged raw table DML.
-- Preserve existing SELECT/RLS and SECURITY DEFINER RPC execution contracts.
revoke insert,update,delete,references,trigger,maintain on table public.results
 from public,anon,authenticated,service_role;
-- The canonical publication RPCs are SECURITY DEFINER and still execute as
-- postgres. A service-role SQL connection must not be a competing publisher.
revoke insert,update,delete,truncate,references,trigger,maintain on table
 public.studio2_show_publication_controls,
 public.studio2_show_publication_executions
 from public,anon,authenticated,service_role;

do $s16_postcheck$
declare v_target text; v_role text; v_privilege text;
begin
 foreach v_target in array array['public.studio2_show_publication_controls','public.studio2_show_publication_executions'] loop
   foreach v_role in array array['anon','authenticated','service_role'] loop
     foreach v_privilege in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
       if has_table_privilege(v_role,v_target,v_privilege) then
         raise exception 'S16 competing publication table writer remains % % %',v_role,v_target,v_privilege using errcode='42501';
       end if;
     end loop;
     if has_any_column_privilege(v_role,v_target,'INSERT,UPDATE') then
       raise exception 'S16 competing publication column writer remains % %',v_role,v_target using errcode='42501';
     end if;
   end loop;
 end loop;
 if not has_function_privilege('authenticated',
       'public.studio2_apply_show_publication_change(uuid,text,jsonb,timestamptz,uuid,text,bigint)','EXECUTE')
    or not has_function_privilege('service_role',
       'public.studio2_publish_due_show_publications()','EXECUTE') then
   raise exception 'S16 publication canonical RPC authority lost' using errcode='55000';
 end if;
 for v_target in select unnest(array[
   'public.country_accounts',
      'public.editions',
      'public.entries',
      'public.edit_tokens',
      'public.jury_votes',
      'public.results',
      'public.shows',
      'public.studio2_result_operations',
      'public.studio2_show_publication_controls',
      'public.studio2_upload_authorizations',
      'public.submissions',
      'public.televote_votes',
      'televoting.televote_aggregations',
      'televoting.vote_submissions']) loop
   for v_role in select unnest(array['anon','authenticated','service_role']) loop
     if has_table_privilege(v_role,v_target,'TRUNCATE') then
       raise exception 'S16 RLS-independent API TRUNCATE remains: % %',v_role,v_target using errcode='42501';
     end if;
     if v_target='public.results' then
       foreach v_privilege in array array['INSERT','UPDATE','DELETE','REFERENCES','TRIGGER','MAINTAIN'] loop
         if has_table_privilege(v_role,v_target,v_privilege) then
           raise exception 'S16 competing Results API table writer remains: % %',v_role,v_privilege using errcode='42501';
         end if;
       end loop;
       if has_any_column_privilege(v_role,v_target,'INSERT,UPDATE') then
         raise exception 'S16 competing Results column writer remains: %',v_role using errcode='42501';
       end if;
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
