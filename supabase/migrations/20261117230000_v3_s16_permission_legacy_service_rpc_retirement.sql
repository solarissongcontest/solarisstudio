begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

-- P16: the Permission Engine R3 preview -> second-operator approval -> CAS
-- command owns capability/role mutations. Two service-only role assignment primitives
-- are redundant remote mutation authorities. Preserve the capability grant/
-- revoke service compatibility RPCs used by existing positive PG17 workflows.
-- This is source-controlled, forward-only, and never runs against hosted CI.
do $preflight$
declare
  v_name text;
  v_oid oid;
  v_targets oid[] := array[]::oid[];
  v_r3 oid := to_regprocedure(
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)'
  );
  v_call text;
begin
  if v_r3 is null
    or not exists (
      select 1 from pg_proc p where p.oid=v_r3
        and p.prosecdef and pg_get_userbyid(p.proowner)='postgres'
        and p.proconfig @> array['search_path=pg_catalog, public, private, auth']::text[]
    )
    or not has_function_privilege('authenticated', v_r3, 'EXECUTE')
    or has_function_privilege('anon', v_r3, 'EXECUTE')
  then
    raise exception 'Unqualified canonical R3 permission authority' using errcode='55000';
  end if;

  if to_regprocedure('public.studio2_request_permission_change_approval(uuid,text,text,uuid,timestamptz,uuid,text,bigint)') is null
     or to_regprocedure('public.studio2_approve_permission_change(uuid)') is null
  then
    raise exception 'R3 approval contract unavailable; retain legacy compatibility' using errcode='55000';
  end if;

  foreach v_name in array array[
    'public.studio2_assign_access_role(uuid,text,uuid,timestamptz)',
    'public.studio2_revoke_access_role(uuid,text,uuid)'
  ] loop
    v_oid := to_regprocedure(v_name);
    if v_oid is null
       or not exists (
         select 1 from pg_proc p where p.oid=v_oid
           and p.prosecdef
           and pg_get_userbyid(p.proowner)='postgres'
           and strpos(p.prosrc, 'private.studio2_request_is_service_role()')>0
       )
       or has_function_privilege('anon', v_oid, 'EXECUTE')
       or has_function_privilege('authenticated', v_oid, 'EXECUTE')
       or not has_function_privilege('service_role', v_oid, 'EXECUTE')
    then
      raise exception 'Legacy service mutation signature or privileges drifted: %',v_name
        using errcode='55000';
    end if;
    v_targets := array_append(v_targets,v_oid);
  end loop;

  -- Two capability service mutations are still explicitly required by the
  -- existing positive local PostgreSQL grant/revoke/replay/permission-version
  -- rehearsal; retiring them without a new governed service operation would
  -- break the validated automation contract, not eliminate release risk.
  if not has_function_privilege('service_role',
      'public.studio2_grant_capability(uuid,text,uuid,timestamptz)','EXECUTE')
     or not has_function_privilege('service_role',
      'public.studio2_revoke_capability(uuid,text,uuid)','EXECUTE')
  then raise exception 'Required service capability grant/revoke boundary drifted' using errcode='55000'; end if;

  -- The PL/pgSQL function body is not dependency-indexed by PostgreSQL's
  -- DROP RESTRICT. Refuse to retire any legacy RPC still called by another
  -- installed SQL function. This check complements the source caller audit.
  foreach v_call in array array[
    'studio2_assign_access_role',
    'studio2_revoke_access_role'
  ] loop
    if exists(
      select 1 from pg_proc p
      where p.oid <> all(v_targets)
        -- Catch qualified/unqualified calls, including whitespace before '('.
        and p.prosrc ~ ('(^|[^[:alnum:]_])' || v_call || '[[:space:]]*\(')
    ) then
      raise exception 'SQL caller still depends on obsolete mutation RPC: %', v_call
        using errcode='55000';
    end if;
  end loop;
end
$preflight$;

select public.v3_register_migration_contract(
  'v3.permissions.legacy-service-mutation-retirement', 1,
  'forward_fix_only', false, null,
  'Remove only obsolete service-role permission role mutation RPCs; preserve validated capability service grant/revoke and R3 approval/CAS'
);

drop function public.studio2_assign_access_role(uuid,text,uuid,timestamptz) restrict;
drop function public.studio2_revoke_access_role(uuid,text,uuid) restrict;

do $postflight$
declare
  v_r3 oid := to_regprocedure(
    'public.studio2_apply_permission_change_r3(uuid,text,text,uuid,timestamptz,uuid,text,bigint,uuid)'
  );
begin
  if to_regprocedure('public.studio2_grant_capability(uuid,text,uuid,timestamptz)') is null
    or to_regprocedure('public.studio2_revoke_capability(uuid,text,uuid)') is null
    or to_regprocedure('public.studio2_assign_access_role(uuid,text,uuid,timestamptz)') is not null
    or to_regprocedure('public.studio2_revoke_access_role(uuid,text,uuid)') is not null
    or not has_function_privilege('service_role','public.studio2_grant_capability(uuid,text,uuid,timestamptz)','EXECUTE')
    or not has_function_privilege('service_role','public.studio2_revoke_capability(uuid,text,uuid)','EXECUTE')
    or v_r3 is null
    or not has_function_privilege('authenticated',v_r3,'EXECUTE')
  then
    raise exception 'Legacy role writer remains, capability compatibility lost or R3 owner lost' using errcode='55000';
  end if;
end
$postflight$;

notify pgrst, 'reload schema';
commit;
