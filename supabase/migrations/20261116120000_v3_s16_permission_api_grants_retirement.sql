-- S16 permission-engine privilege boundary. Forward-only and source-controlled.
-- This does NOT authorize hosted migration. Canonical R3 and tightly scoped
-- service-only SECURITY DEFINER compatibility RPCs retain mutation ownership.
begin;
set local statement_timeout='60s';
set local lock_timeout='5s';

do $permission_preflight$
declare v_relation text; v_table pg_class%rowtype; v_fn text; v_proc pg_proc%rowtype;
begin
  if current_user <> 'postgres'
     or current_setting('server_version_num')::int / 10000 <> 17
     or to_regprocedure('public.v3_register_migration_contract(text,integer,text,boolean,text,text)') is null
  then raise exception 'S16 permission cutover requires reviewed PG17 migration owner' using errcode='55000';
  end if;

  foreach v_relation in array array[
    'public.studio2_capability_grants',
    'public.studio2_role_assignments',
    'public.studio2_role_capabilities',
    'public.studio2_permission_subject_versions'
  ] loop
    select * into v_table from pg_class where oid=to_regclass(v_relation);
    if v_table.oid is null or v_table.relkind <> 'r'
       or pg_get_userbyid(v_table.relowner) <> 'postgres'
       or not v_table.relrowsecurity
       or exists (select 1 from pg_attribute a
         where a.attrelid=v_table.oid and a.attnum>0
           and not a.attisdropped and a.attacl is not null)
    then raise exception 'S16 unqualified permission table/column grants: %',v_relation using errcode='55000';
    end if;
    if not has_table_privilege('service_role',v_relation,'SELECT') then
       raise exception 'S16 permission service read prerequisite missing: %',v_relation using errcode='55000';
    end if;
  end loop;

  foreach v_fn in array array[
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)',
    'public.studio2_request_permission_change_approval(uuid,text,text,uuid,timestamptz,uuid,text,bigint)',
    'public.studio2_approve_permission_change(uuid)'
  ] loop
    select * into v_proc from pg_proc where oid=to_regprocedure(v_fn);
    if v_proc.oid is null or not v_proc.prosecdef
      or pg_get_userbyid(v_proc.proowner) <> 'postgres'
      or v_proc.proconfig is distinct from array['search_path=pg_catalog, public, private, auth']::text[]
      or not has_function_privilege('authenticated',v_fn,'EXECUTE')
    then raise exception 'S16 canonical permission command drift: %',v_fn using errcode='55000';
    end if;
  end loop;

  foreach v_fn in array array[
    'public.studio2_grant_capability(uuid,text,uuid,timestamptz)',
    'public.studio2_revoke_capability(uuid,text,uuid)',
    'public.studio2_assign_access_role(uuid,text,uuid,timestamptz)',
    'public.studio2_revoke_access_role(uuid,text,uuid)'
  ] loop
    select * into v_proc from pg_proc where oid=to_regprocedure(v_fn);
    if v_proc.oid is null or not v_proc.prosecdef
      or pg_get_userbyid(v_proc.proowner) <> 'postgres'
      or v_proc.proconfig is distinct from array['search_path=pg_catalog, public, private']::text[]
      or not has_function_privilege('service_role',v_fn,'EXECUTE')
      or has_function_privilege('anon',v_fn,'EXECUTE')
      or has_function_privilege('authenticated',v_fn,'EXECUTE')
    then raise exception 'S16 service-only permission helper drift: %',v_fn using errcode='55000';
    end if;
  end loop;
end
$permission_preflight$;

select public.v3_register_migration_contract(
 'v3.s16.permission-direct-write-retirement',1,'forward_fix_only',false,null,
 'Remove direct API SQL mutation from four permission tables while preserving canonical R3 and service-only owner-executed RPCs'
);

revoke insert,update,delete,truncate,references,trigger,maintain on table
 public.studio2_capability_grants,
 public.studio2_role_assignments,
 public.studio2_role_capabilities,
 public.studio2_permission_subject_versions
from public,anon,authenticated,service_role;

do $permission_postcheck$
declare v_table text; v_role text; v_perm text;
begin
  foreach v_table in array array[
    'public.studio2_capability_grants',
    'public.studio2_role_assignments',
    'public.studio2_role_capabilities',
    'public.studio2_permission_subject_versions'
  ] loop
    foreach v_role in array array['anon','authenticated','service_role'] loop
      foreach v_perm in array array['INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN'] loop
        if has_table_privilege(v_role,v_table,v_perm) then
          raise exception 'S16 competing direct permission writer: % % %',v_role,v_table,v_perm using errcode='42501';
        end if;
      end loop;
      if has_any_column_privilege(v_role,v_table,'INSERT')
         or has_any_column_privilege(v_role,v_table,'UPDATE')
      then raise exception 'S16 independent permission column authority: % %',v_role,v_table using errcode='42501';
      end if;
    end loop;
    if not has_table_privilege('service_role',v_table,'SELECT') then
       raise exception 'S16 permission service read regression: %',v_table using errcode='55000';
    end if;
  end loop;
end
$permission_postcheck$;

notify pgrst, 'reload schema';
commit;
